"""经真实服务 API 创建部分索引验收语料并记录导出和清理结果。

@author 称霸幼儿园
"""

import argparse
import asyncio
import json
import secrets
import time
import zlib
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
import redis.asyncio as aioredis

from clients._internal import internal_headers, unwrap_res_data
from clients.knowledge import KnowledgeClient
from clients.nacos import NacosManager
from clients.notify import NotifyClient
from core.config import RuntimeConfigStore, Settings
import indexing.es_store as es_store_module
from evals.indexing_admin import (
    DeterministicEmbeddingAdapter,
    FixtureDatabase,
    FixtureSourceAdapter,
    cleanup_fixture_tokens,
    cleanup_legacy_documents,
    cleanup_verified,
)
from evals.seed import DEFAULT_BASE_COVER
from evals.verify_indexing import (
    _primary_aliases,
    _scan_documents,
    cleanup_prefix_indices,
    validate_index_documents,
)
from indexing.models import NOTE_ENTITY_TYPES, DOC_STATUS_INDEXED, DOC_STATUS_UNEXTRACTABLE, SourceDocument
from models.catalog import LogicalModelMapping, ModelCatalogSnapshot, ProviderSnapshot
from worker import HealthProbeServer, build_pipeline, run_daemon, validate_internal_secret


@dataclass
class FixtureManifest:
    """记录验收资源的非敏感标识。

    @author 称霸幼儿园
    """

    prefix: str
    corpus_version: int
    username: str = ""
    user_id: int | None = None
    kb_id: int | None = None
    mooc_id: int | None = None
    refs: dict[str, str] = field(default_factory=dict)
    object_names: list[str] = field(default_factory=list)
    file_ids: list[int] = field(default_factory=list)
    row_ids: dict[str, list[int]] = field(default_factory=dict)
    assertions: list[dict[str, Any]] = field(default_factory=list)
    durations_s: dict[str, float] = field(default_factory=dict)
    cleanup: dict[str, Any] = field(default_factory=dict)

    def write(self, output: Path) -> None:
        """把资源标识和断言结果写入可恢复清理清单。"""
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(asdict(self), ensure_ascii=False, indent=2), encoding="utf-8")


class FixtureGateway:
    """以临时用户身份调用网关并记录资源请求。

    @author 称霸幼儿园
    """

    def __init__(self, client: httpx.AsyncClient):
        """保存网关客户端及本次临时会话。"""
        self.client = client
        self.token: str | None = None
        self.refresh_token: str | None = None
        self.manifest: FixtureManifest | None = None

    async def call(self, method: str, path: str, body: dict[str, Any] | None = None, **kwargs) -> Any:
        """发送请求并返回成功响应信封中的 data。"""
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        response = await self.client.request(method, path, json=body, headers=headers, **kwargs)
        response.raise_for_status()
        envelope = response.json()
        if envelope.get("code") != "00000":
            raise RuntimeError(f"{method} {path} code={envelope.get('code')}")
        return envelope.get("data")


def build_markdown_fixture(config: dict[str, Any]) -> str:
    """生成固定长代码、表格和深层标题 Markdown。"""
    code = "\n".join(f"print('index-{number}')" for number in range(int(config["codeLines"])))
    rows = "\n".join(f"| token-{number} | {number} |" for number in range(int(config["tableRows"])))
    return (
        "# 知识检索\n索引把知识实体变成可召回的证据。\n\n"
        "## 倒排结构\n### 倒排词典\n词项关联文档列表。\n\n"
        f"```python\n{code}\n```\n\n| 词项 | 编号 |\n| --- | --- |\n{rows}\n"
    )


def _pdf_bytes(objects: list[bytes]) -> bytes:
    """为固定 PDF 对象生成完整交叉引用表。"""
    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, content in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f"{number} 0 obj\n".encode() + content + b"\nendobj\n")
    xref = len(output)
    output.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode())
    output.extend(f"trailer << /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(output)


def build_pdf_fixture(kind: str) -> bytes:
    """生成文本层、扫描图像或双栏固定 PDF 样本。"""
    if kind not in {"text", "scanned", "columns"}:
        raise ValueError(kind)
    resources = b"<< /Font << /F1 4 0 R >> >>"
    font = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    if kind == "scanned":
        image = zlib.compress(bytes([245, 20, 245, 20] * 64))
        resources = b"<< /XObject << /Im0 4 0 R >> >>"
        font = (
            f"<< /Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace /DeviceGray "
            f"/BitsPerComponent 8 /Filter /FlateDecode /Length {len(image)} >>\nstream\n".encode()
            + image + b"\nendstream"
        )
        stream = b"q 500 0 0 700 40 40 cm /Im0 Do Q"
    else:
        stream = b"BT /F1 20 Tf 36 750 Td (Indexing acceptance) Tj ET\n"
        if kind == "columns":
            for index in range(8):
                y = 700 - index * 22
                stream += f"BT /F1 12 Tf 36 {y} Td (Left column index term {index}) Tj ET\n".encode()
                stream += f"BT /F1 12 Tf 330 {y} Td (Right column source term {index}) Tj ET\n".encode()
        else:
            stream += b"BT /F1 12 Tf 36 700 Td (Inverted indexes map terms to documents.) Tj ET\n"
    return _pdf_bytes([
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources "
        + resources + b" /Contents 5 0 R >>",
        font,
        f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"endstream",
    ])


def expected_refs(manifest: FixtureManifest) -> list[str]:
    """返回去重后的验收 canonical 引用。"""
    return list(dict.fromkeys(manifest.refs.values()))


async def _find_fixture_notice(notify: NotifyClient, kb_id: int, title: str) -> SourceDocument | None:
    """分页查找本次任务异步生成的知识库通知。"""
    cursor = 0
    while True:
        page = await notify.export_notices(after_id=cursor, limit=200)
        match = next((doc for doc in page.documents if doc.kb_id == kb_id and doc.title == title), None)
        if match is not None:
            return match
        if not page.has_more:
            return None
        next_cursor = page.next_after_id
        if next_cursor is None or next_cursor <= cursor:
            raise RuntimeError("notice export cursor did not advance")
        cursor = next_cursor


async def seed_api_fixture(
    gateway: FixtureGateway,
    knowledge: KnowledgeClient,
    notify: NotifyClient,
    corpus: dict[str, Any],
    output: Path,
    notice_timeout_s: float = 30,
) -> FixtureManifest:
    """经已存在的服务接口创建可用语料并及时记录资源标识。"""
    prefix = f"m164{secrets.token_hex(4)}"
    manifest = FixtureManifest(prefix=prefix, corpus_version=int(corpus["version"]))
    gateway.manifest = manifest
    manifest.username = f"m164{secrets.token_hex(5)}"
    password = f"Aa1{secrets.token_hex(6)}"
    manifest.write(output)
    data = await gateway.call("POST", "/api/auth/register", {
        "username": manifest.username, "password": password, "nickname": prefix, "sex": 0,
    })
    gateway.token = data["token"]["accessToken"]
    gateway.refresh_token = data["token"].get("refreshToken")
    manifest.user_id = (await knowledge.scope(gateway.token)).user_id
    manifest.write(output)
    base = await gateway.call("POST", "/api/note/bases", {
        "name": f"{prefix}_kb", "detail": "固定索引验收语料", "cover": DEFAULT_BASE_COVER, "type": 0,
    })
    manifest.kb_id = int(base["id"])
    manifest.refs["kb"] = f"kb:{manifest.kb_id}"
    manifest.write(output)
    note_id = await gateway.call("POST", "/api/note/notes", {
        "knowledgeBaseId": manifest.kb_id, "title": f"{prefix}笔记",
    })
    manifest.refs["note"] = f"note:{note_id}"
    manifest.write(output)
    await gateway.call("PATCH", f"/api/note/notes/{note_id}", {"content": build_markdown_fixture(corpus["markdown"])})
    for kind in corpus["pdfKinds"]:
        document = await gateway.call("POST", "/api/note/docs/pdfs", files={
            "pdf": (f"{prefix}_{kind}.pdf", build_pdf_fixture(kind), "application/pdf"),
        }, data={"knowledgeBaseId": str(manifest.kb_id), "uploadId": f"{prefix}_{kind}"})
        ref = f"doc:{document['id']}"
        manifest.refs[f"doc_{kind}"] = ref
        manifest.write(output)
        source = await knowledge.documents_batch([ref])
        manifest.object_names.extend(doc.object_name for doc in source.documents if doc.object_name)
        manifest.write(output)
    manifest.mooc_id = int(await gateway.call("POST", "/api/note/moocs", {
        "title": f"{prefix}_mooc", "cover": DEFAULT_BASE_COVER,
        "moocDescription": "倒排结构与知识检索", "knowledgeBaseId": manifest.kb_id, "dataScope": 3,
    }))
    manifest.refs["mooc"] = f"mooc:{manifest.mooc_id}"
    manifest.write(output)
    for key, item_type, text in (("mooc_item", 2, "# 课程文档\n倒排词典映射词项。"), ("video", 1, None)):
        item_id = await gateway.call("POST", "/api/note/moocs/items", {
            "moocId": manifest.mooc_id,
            "item": {"title": f"{prefix}_{key}", "moocItemType": item_type, "parentId": 0, "itemText": text},
        })
        manifest.refs[key] = f"mooc_item:{item_id}"
        manifest.write(output)
    now = int(time.time() * 1000)
    task_name = f"{prefix}_task"
    task = await gateway.call("POST", "/api/note/admin/noteTasks", {
        "taskName": task_name, "taskDescribe": "解释倒排词典与文档映射",
        "knowledgeBaseId": manifest.kb_id, "startTime": now, "endTime": now + 7 * 86400_000,
    })
    manifest.refs["task"] = f"task:{task['id']}"
    manifest.write(output)
    deadline = time.monotonic() + notice_timeout_s
    while True:
        notice = await _find_fixture_notice(notify, manifest.kb_id, f"任务：{task_name}")
        if notice is not None:
            manifest.refs["notice"] = notice.ref
            manifest.write(output)
            break
        if time.monotonic() >= deadline:
            manifest.assertions.append({"name": "task_notice_created", "passed": False})
            manifest.write(output)
            break
        await asyncio.sleep(0.25)
    return manifest


async def export_fixture_documents(
    manifest: FixtureManifest,
    knowledge: KnowledgeClient,
    notify: NotifyClient,
) -> list[SourceDocument]:
    """从真实 note/notify 内部导出端点收集验收资料。"""
    documents: list[SourceDocument] = []
    for entity_type in NOTE_ENTITY_TYPES:
        cursor = 0
        while True:
            page = await knowledge.export(entity_type, after_id=cursor, kb_id=manifest.kb_id, limit=200)
            documents.extend(page.documents)
            if not page.has_more:
                break
            next_cursor = page.next_after_id
            if next_cursor is None or next_cursor <= cursor:
                raise RuntimeError(f"export cursor did not advance entity_type={entity_type}")
            cursor = next_cursor
    notice_ref = manifest.refs.get("notice")
    if notice_ref:
        batch = await notify.notices_batch([int(notice_ref.split(":", 1)[1])])
        documents.extend(batch.documents)
    return documents


async def cleanup_api_fixture(manifest: FixtureManifest, gateway: FixtureGateway) -> dict[str, Any]:
    """执行已有删除接口并报告需要额外清理的资源。"""
    applied: list[str] = []
    errors: list[dict[str, str]] = []
    for ref in expected_refs(manifest):
        entity_type, entity_id = ref.split(":", 1)
        if entity_type == "note":
            path = f"/api/note/notes/{entity_id}"
        elif entity_type == "doc":
            path = f"/api/note/docs/{entity_id}"
        else:
            continue
        try:
            await gateway.call("DELETE", path)
            applied.append(ref)
        except (httpx.HTTPError, RuntimeError) as error:
            errors.append({"ref": ref, "error_type": type(error).__name__})
    if manifest.mooc_id:
        item_ids = [int(ref.split(":", 1)[1]) for ref in expected_refs(manifest) if ref.startswith("mooc_item:") and "#" not in ref]
        try:
            if item_ids:
                await gateway.call("POST", "/api/note/moocs/batchDeleteItems", {"moocId": manifest.mooc_id, "itemIds": item_ids})
                applied.extend(f"mooc_item:{item_id}" for item_id in item_ids)
            await gateway.call("DELETE", f"/api/note/moocs/{manifest.mooc_id}")
            applied.append(f"mooc:{manifest.mooc_id}")
        except (httpx.HTTPError, RuntimeError) as error:
            errors.append({"ref": f"mooc:{manifest.mooc_id}", "error_type": type(error).__name__})
    if manifest.kb_id:
        try:
            await gateway.call("DELETE", f"/api/note/bases/{manifest.kb_id}")
            applied.append(f"kb:{manifest.kb_id}")
        except (httpx.HTTPError, RuntimeError) as error:
            errors.append({"ref": f"kb:{manifest.kb_id}", "error_type": type(error).__name__})
    if gateway.token:
        try:
            await gateway.call("POST", "/api/auth/logout", {
                "accessToken": gateway.token, "refreshToken": gateway.refresh_token,
            })
        except (httpx.HTTPError, RuntimeError) as error:
            errors.append({"ref": "session", "error_type": type(error).__name__})
    manifest.cleanup = {
        "api_deleted_refs": applied,
        "errors": errors,
        "requires_additional_cleanup": ["user", "task", "notice", "file_rows_and_objects", "logical_deleted_rows", "mooc_child_rows"],
        "verified_zero": False,
    }
    return manifest.cleanup


async def upload_fixture_subtitle(
    settings: Settings,
    manifest: FixtureManifest,
    subtitle: str,
) -> None:
    """通过真实内部文件 API 上传本轮 SRT 并记录文件与对象 ID。"""
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"{settings.FILE_SERVICE_URL.rstrip('/')}/",
            headers=internal_headers(settings),
            data={
                "path": "mooc/srt",
                "userId": str(manifest.user_id),
                "uploadId": f"{manifest.prefix}_subtitle",
                "source": "5",
            },
            files={"file": (f"{manifest.prefix}.srt", subtitle.encode(), "application/x-subrip")},
        )
    data = unwrap_res_data(response, "anynote-file")
    manifest.file_ids.append(int(data["id"]))
    manifest.object_names.append(str(data["objectName"]))


async def record_supplement_changes(settings: Settings, manifest: FixtureManifest) -> None:
    """通过真实内部变更 API 登记字幕与总结更新。"""
    item_id = int(manifest.refs["video"].split(":", 1)[1])
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{settings.NOTE_SERVICE_URL.rstrip('/')}/internal/v1/knowledge/changes",
            headers=internal_headers(settings),
            json={
                "entityType": "transcript", "entityId": item_id,
                "knowledgeBaseId": manifest.kb_id, "operation": "UPDATE",
            },
        )
        unwrap_res_data(response, "anynote-note")
        response = await client.post(
            f"{settings.NOTE_SERVICE_URL.rstrip('/')}/internal/v1/knowledge/mooc-items/{item_id}/summary-changes",
            headers=internal_headers(settings),
        )
        unwrap_res_data(response, "anynote-note")


class DeterministicFixtureCatalog:
    """提供只指向本地确定性替身的固定模型快照。

    @author 称霸幼儿园
    """

    async def snapshot(self) -> ModelCatalogSnapshot:
        """返回启用八维本地向量替身的目录快照。"""
        return ModelCatalogSnapshot(
            version="m164-deterministic-fixture-v1",
            providers=[ProviderSnapshot(
                providerKey="local-fixture", displayName="local-fixture", protocol="openai_compatible",
                baseUrl="http://localhost", apiKey="unused", models=[], dataEgressAllowed=True, enabled=True,
            )],
            logicalModels={"embedding": LogicalModelMapping(
                provider="local-fixture", model="m164-deterministic", enabled=True, dimensions=8,
            )},
        )


def _record(manifest: FixtureManifest, name: str, passed: bool, **details: Any) -> None:
    """追加一项结构化验收断言。"""
    manifest.assertions.append({"name": name, "passed": bool(passed), **details})


async def _wait_until(probe, timeout_s: float = 30.0) -> bool:
    """在限定时间内轮询异步条件并返回最终结果。"""
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if await probe():
            return True
        await asyncio.sleep(0.1)
    return bool(await probe())


async def _content_visible(client, chunk_index: str, item_key: str, token: str) -> bool:
    """通过真实 ES 全文查询确认指定正文片段可读。"""
    response = await client.search(
        index=chunk_index,
        query={
            "bool": {
                "must": [{"match_phrase": {"content": token}}],
                "filter": [{"term": {"item_key": item_key}}, {"term": {"readable": True}}],
            }
        },
        size=1,
        _source=["item_key"],
    )
    return bool(response.get("hits", {}).get("hits"))


async def _item_chunks(client, chunk_index: str, item_key: str) -> list[dict[str, Any]]:
    """读取固定条目的完整片段载荷用于结构断言。"""
    response = await client.search(
        index=chunk_index,
        query={"bool": {"filter": [{"term": {"item_key": item_key}}, {"term": {"readable": True}}]}},
        size=1000,
        sort=[{"chunk_index": "asc"}],
    )
    return [hit.get("_source") or {} for hit in response.get("hits", {}).get("hits", [])]


async def _assert_indexed_fixture(
    manifest: FixtureManifest,
    documents: list[SourceDocument],
    database: FixtureDatabase,
    client,
    store,
) -> None:
    """独立核对九类来源、索引完整性、资料状态与固定结构样本。"""
    expected = {doc.canonical_key: (doc.content_version or "", doc.meta_version or "") for doc in documents}
    active = await store.get_active_meta()
    if active is None:
        raise RuntimeError
    items = await _scan_documents(client, active["item_index"])
    chunks = await _scan_documents(client, active["chunk_index"])
    integrity_errors = validate_index_documents(expected, items, chunks)
    _record(manifest, "independent_nine_entity_integrity", not integrity_errors, errors=integrity_errors)
    _record(manifest, "independent_exact_item_set", len(items) == len(expected))

    statuses = database.doc_statuses(manifest)
    expected_statuses = {}
    for kind in ("text", "columns"):
        expected_statuses[int(manifest.refs[f"doc_{kind}"].split(":", 1)[1])] = DOC_STATUS_INDEXED
    expected_statuses[int(manifest.refs["doc_scanned"].split(":", 1)[1])] = DOC_STATUS_UNEXTRACTABLE
    _record(manifest, "real_doc_index_status_writeback", statuses == expected_statuses, actual=statuses)

    note_chunks = await _item_chunks(client, active["chunk_index"], manifest.refs["note"])
    code_chunks = [chunk for chunk in note_chunks if "print('index-0')" in chunk.get("content", "")]
    table_chunks = [chunk for chunk in note_chunks if "| token-0 | 0 |" in chunk.get("content", "")]
    _record(
        manifest,
        "markdown_atomic_code_table_and_lines",
        len(code_chunks) == 1
        and "print('index-99')" in code_chunks[0].get("content", "")
        and code_chunks[0].get("content", "").count("```") == 2
        and len(table_chunks) == 1
        and "| token-19 | 19 |" in table_chunks[0].get("content", "")
        and all(chunk.get("start_line") is not None and chunk.get("end_line") is not None for chunk in note_chunks),
    )

    transcript_chunks = await _item_chunks(client, active["chunk_index"], manifest.refs["transcript"])
    _record(
        manifest,
        "srt_time_window_and_gap",
        len(transcript_chunks) == 2
        and transcript_chunks[-1].get("start_ms") == 601000
        and all((chunk.get("end_ms") or 0) - (chunk.get("start_ms") or 0) <= 60000 for chunk in transcript_chunks),
    )
    summary_chunks = await _item_chunks(client, active["chunk_index"], manifest.refs["summary"])
    _record(manifest, "summary_body_indexed", any("倒排索引按词项" in chunk.get("content", "") for chunk in summary_chunks))

    for kind in ("text", "columns"):
        pdf_chunks = await _item_chunks(client, active["chunk_index"], manifest.refs[f"doc_{kind}"])
        _record(
            manifest,
            f"pdf_{kind}_indexed",
            bool(pdf_chunks) and all(chunk.get("page_no") == 1 for chunk in pdf_chunks),
        )
    scanned_chunks = await _item_chunks(client, active["chunk_index"], manifest.refs["doc_scanned"])
    _record(manifest, "scanned_pdf_has_no_chunks", not scanned_chunks)


async def _run_latency_probe(
    mode: str,
    settings: Settings,
    runtime_store: RuntimeConfigStore,
    pipeline,
    store,
    gateway: FixtureGateway,
    manifest: FixtureManifest,
    client,
    redis_client,
) -> dict[str, Any]:
    """分别测量 Redis 唤醒和三秒轮询下的修改到可检索时延。"""
    current = runtime_store.get()
    interval = 60.0 if mode == "redis_wakeup" else 3.0
    runtime_store.update(current.model_copy(update={
        "indexer": current.indexer.model_copy(update={"poll_interval_s": interval}),
    }))
    channel = settings.REDIS_WAKEUP_CHANNEL if mode == "redis_wakeup" else f"{manifest.prefix}:polling-only"
    probe_settings = settings.model_copy(update={
        "REDIS_WAKEUP_CHANNEL": channel,
        "INDEXER_HEALTH_HOST": "127.0.0.1",
        "INDEXER_HEALTH_PORT": 0,
    })
    stop = asyncio.Event()
    health = HealthProbeServer("127.0.0.1", 0, pipeline)
    task = asyncio.create_task(run_daemon(probe_settings, runtime_store, pipeline, health, stop_event=stop))
    token = f"{mode.replace('_', '')}{uuid4().hex}"
    started = time.monotonic()
    try:
        if mode == "redis_wakeup":
            subscribed = await _wait_until(lambda: _redis_subscribed(redis_client, channel))
            if not subscribed:
                raise RuntimeError

        async def caught_up() -> bool:
            """判断本轮隔离游标是否已追平权威源。"""
            latest = await pipeline._knowledge.changes(after_id=0, limit=1)
            return await store.get_cursor() == latest.latest_cursor

        if not await _wait_until(caught_up):
            raise RuntimeError
        active = await store.get_active_meta()
        if active is None:
            raise RuntimeError
        started = time.monotonic()
        await gateway.call("PATCH", f"/api/note/notes/{manifest.refs['note'].split(':', 1)[1]}", {"content": token})
        visible = await _wait_until(
            lambda: _content_visible(client, active["chunk_index"], manifest.refs["note"], token),
        )
        elapsed = time.monotonic() - started
        return {"passed": visible, "seconds": round(elapsed, 6), "poll_interval_s": interval, "channel": channel}
    finally:
        stop.set()
        await task


async def _redis_subscribed(redis_client, channel: str) -> bool:
    """确认真实 Redis 频道已有本轮守护进程订阅。"""
    response = await redis_client.pubsub_numsub(channel)
    return bool(response and int(response[0][1]) > 0)


def _set_cleanup_error(manifest: FixtureManifest, channel: str, error: Exception) -> None:
    """仅记录清理通道与异常类型，不写入凭据或响应正文。"""
    manifest.cleanup.setdefault("errors", []).append({"channel": channel, "error_type": type(error).__name__})


async def main_async(args: argparse.Namespace) -> None:
    """执行九类真实语料、隔离索引、增量时延与精确物理清理。"""
    prefix = f"m164_probe_{uuid4().hex[:12]}"
    settings = Settings().model_copy(update={
        "HOST": prefix.replace("_", "-"),
        "NACOS_SERVICE_NAME": f"anynote-ai-indexer-fixture-{prefix[-12:]}",
    })
    validate_internal_secret(settings)
    corpus = json.loads(Path(args.corpus).read_text(encoding="utf-8"))
    output = Path(args.output)
    knowledge = KnowledgeClient(settings)
    notify = NotifyClient(settings)
    database = FixtureDatabase()
    runtime_store = RuntimeConfigStore(settings.runtime_defaults())
    nacos = NacosManager(settings, runtime_store)
    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    original_aliases = (es_store_module.ITEM_ALIAS, es_store_module.CHUNK_ALIAS, es_store_module.META_INDEX)
    manifest: FixtureManifest | None = None
    pipeline = None
    store = None
    independent_client = None
    primary_before = None
    full_fixture = False

    try:
        async with httpx.AsyncClient(base_url=args.gateway, timeout=60) as client:
            gateway = FixtureGateway(client)
            try:
                manifest = await seed_api_fixture(gateway, knowledge, notify, corpus, output)
                await upload_fixture_subtitle(settings, manifest, corpus["subtitle"])
                manifest.write(output)
                database.supplement_video(manifest, manifest.object_names[-1], corpus["summary"])
                await record_supplement_changes(settings, manifest)
                manifest.write(output)
                documents = await export_fixture_documents(manifest, knowledge, notify)
                actual_types = sorted({doc.entity_type for doc in documents})
                actual_refs = {doc.canonical_key for doc in documents}
                expected_refs_set = set(manifest.refs.values())
                _record(
                    manifest, "source_export_entity_types", set(actual_types) == set(corpus["requiredEntityTypes"]),
                    expected=corpus["requiredEntityTypes"], actual=actual_types,
                )
                _record(
                    manifest, "source_export_exact_refs", actual_refs == expected_refs_set,
                    expected=sorted(expected_refs_set), actual=sorted(actual_refs),
                )
                full_fixture = all(key in manifest.refs for key in (
                    "kb", "note", "doc_text", "doc_scanned", "doc_columns", "mooc", "mooc_item",
                    "video", "transcript", "summary", "task", "notice",
                ))
                manifest.write(output)

                await nacos.start()
                independent_client = es_store_module.build_es_client(settings, runtime_store.get().indexer)
                primary_before = await _primary_aliases(independent_client)
                es_store_module.ITEM_ALIAS = f"{prefix}_item"
                es_store_module.CHUNK_ALIAS = f"{prefix}_chunk"
                es_store_module.META_INDEX = f"{prefix}_meta"
                pipeline, store = await build_pipeline(settings, runtime_store)
                pipeline._model_providers = DeterministicFixtureCatalog()
                pipeline._model_adapter = DeterministicEmbeddingAdapter(dims=8)
                pipeline._adapter = FixtureSourceAdapter(pipeline._adapter, manifest)

                phase_started = time.monotonic()
                rebuilt = await pipeline.run_rebuild()
                manifest.durations_s["rebuild"] = round(time.monotonic() - phase_started, 6)
                _record(manifest, "rebuild_document_count", rebuilt == len(documents), actual=rebuilt, expected=len(documents))
                await _assert_indexed_fixture(manifest, documents, database, independent_client, store)

                phase_started = time.monotonic()
                first_reconcile = await pipeline.run_reconcile(kb_id=manifest.kb_id)
                manifest.durations_s["first_reconcile"] = round(time.monotonic() - phase_started, 6)
                phase_started = time.monotonic()
                second_reconcile = await pipeline.run_reconcile(kb_id=manifest.kb_id)
                manifest.durations_s["second_reconcile"] = round(time.monotonic() - phase_started, 6)
                mutations = {"indexed", "meta_updated", "deleted", "failed", "unextractable"}
                _record(manifest, "second_reconcile_zero_mutation", all(second_reconcile.get(key, 0) == 0 for key in mutations))
                manifest.assertions[-1]["first"] = first_reconcile
                manifest.assertions[-1]["second"] = second_reconcile

                mooc_ref = manifest.refs["mooc"]
                active = await store.get_active_meta()
                before = (await store.get_existing_items(active["item_index"], [mooc_ref]))[mooc_ref]
                calls_before = len(pipeline._model_adapter.embed_calls)
                await gateway.call("PATCH", f"/api/note/moocs/{manifest.mooc_id}", {"dataScope": 2})
                await pipeline.run_incremental()
                after_acl = (await store.get_existing_items(active["item_index"], [mooc_ref]))[mooc_ref]
                _record(
                    manifest, "acl_only_change_skips_embedding",
                    after_acl.get("generation") == before.get("generation")
                    and after_acl.get("data_scope") == 2
                    and len(pipeline._model_adapter.embed_calls) == calls_before,
                )

                await gateway.call(
                    "PATCH", f"/api/note/moocs/{manifest.mooc_id}", {"title": f"{manifest.prefix}_mooc_updated"},
                )
                await pipeline.run_incremental()
                after_title = (await store.get_existing_items(active["item_index"], [mooc_ref]))[mooc_ref]
                _record(
                    manifest, "title_only_change_reembeds",
                    after_title.get("generation") != after_acl.get("generation")
                    and len(pipeline._model_adapter.embed_calls) > calls_before,
                )

                wakeup = await _run_latency_probe(
                    "redis_wakeup", settings, runtime_store, pipeline, store, gateway, manifest,
                    independent_client, redis_client,
                )
                manifest.durations_s["redis_wakeup_to_searchable"] = wakeup["seconds"]
                _record(manifest, "redis_wakeup_to_searchable", wakeup["passed"], details=wakeup)
                polling = await _run_latency_probe(
                    "polling", settings, runtime_store, pipeline, store, gateway, manifest,
                    independent_client, redis_client,
                )
                manifest.durations_s["polling_to_searchable"] = polling["seconds"]
                _record(manifest, "polling_to_searchable", polling["passed"], details=polling)
            except Exception as error:
                if manifest is None:
                    raise
                _record(manifest, "fixture_acceptance_execution", False, error_type=type(error).__name__)
            finally:
                if manifest is not None:
                    await cleanup_api_fixture(manifest, gateway)
                    manifest.write(output)

        if manifest is not None and pipeline is not None and store is not None:
            try:
                await pipeline.run_incremental()
                active = await store.get_active_meta()
                remaining = await independent_client.count(
                    index=active["item_index"], query={"term": {"kb_id": manifest.kb_id}},
                )
                _record(manifest, "api_deletes_converge_index_to_zero", int(remaining["count"]) == 0)
            except Exception as error:
                _record(manifest, "api_deletes_converge_index_to_zero", False, error_type=type(error).__name__)
    finally:
        if manifest is not None:
            if full_fixture:
                try:
                    manifest.cleanup["database"] = database.physical_cleanup(manifest)
                except Exception as error:
                    _set_cleanup_error(manifest, "database", error)
                try:
                    manifest.cleanup["objects"] = database.cleanup_objects(manifest)
                except Exception as error:
                    _set_cleanup_error(manifest, "objects", error)
                try:
                    manifest.cleanup["tokens"] = await cleanup_fixture_tokens(redis_client, manifest.username)
                except Exception as error:
                    _set_cleanup_error(manifest, "tokens", error)
                if independent_client is not None:
                    try:
                        manifest.cleanup["legacy"] = await cleanup_legacy_documents(independent_client, manifest)
                    except Exception as error:
                        _set_cleanup_error(manifest, "legacy", error)
            else:
                _set_cleanup_error(manifest, "database", ValueError())
            if independent_client is not None:
                try:
                    index_cleanup = await cleanup_prefix_indices(independent_client, prefix)
                    manifest.cleanup["index_details"] = index_cleanup
                    manifest.cleanup["indices"] = index_cleanup["remaining"]
                    primary_after = await _primary_aliases(independent_client)
                    _record(manifest, "primary_aliases_unchanged", primary_before == primary_after)
                except Exception as error:
                    _set_cleanup_error(manifest, "indices", error)
            manifest.cleanup["verified_zero"] = (
                cleanup_verified(manifest.cleanup) and not manifest.cleanup.get("errors") and full_fixture
            )
            manifest.write(output)

        es_store_module.ITEM_ALIAS, es_store_module.CHUNK_ALIAS, es_store_module.META_INDEX = original_aliases
        if store is not None:
            await store.close()
        if independent_client is not None:
            await independent_client.close()
        await redis_client.aclose()
        await nacos.close()

    if manifest is None:
        raise RuntimeError("indexing fixture was not created")
    print(json.dumps({
        "output": str(output), "assertions": manifest.assertions,
        "durations_s": manifest.durations_s, "cleanup": manifest.cleanup,
    }, ensure_ascii=False))
    if not all(item["passed"] for item in manifest.assertions) or not manifest.cleanup.get("verified_zero"):
        raise SystemExit(1)


def main() -> None:
    """解析验收语料命令参数。"""
    parser = argparse.ArgumentParser(description="M16.4 固定语料真实 API 验收")
    parser.add_argument("--gateway", default="http://anynote-gateway:8080")
    parser.add_argument("--corpus", default="evals/indexing_corpus_v1.json")
    parser.add_argument("--output", default="evals/output/indexing_manifest.json")
    asyncio.run(main_async(parser.parse_args()))


if __name__ == "__main__":
    main()
