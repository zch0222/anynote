"""索引管线与 ES 内存仿真单元测试。

@author 称霸幼儿园
"""

import io

import pytest
from pypdf import PdfWriter

from core.config import RuntimeConfigStore, Settings
from indexing.es_store import ElasticsearchKnowledgeStore
from indexing.models import (
    ALL_ENTITY_TYPES,
    DOC_STATUS_INDEXED,
    DOC_STATUS_UNEXTRACTABLE,
    INDEX_VERSION_CONFLICT_MESSAGE,
    IndexVersionConflictError,
    KnowledgeChangeEvent,
    KnowledgeChangePage,
    KnowledgeDocumentBatch,
    KnowledgeExportPage,
    KnowledgeNoticeBatch,
    SourceAcl,
    SourceDocument,
)
from indexing.pipeline import IndexingPipeline
from models.catalog import ModelCatalogSnapshot


def _blank_pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


class InMemoryEsStore:
    """仅用于单元测试的内存 ElasticsearchKnowledgeStore 替身。"""

    def __init__(self):
        self.active_meta: dict | None = None
        self.cursor: int = 0
        self.items: dict[str, dict[str, dict]] = {}
        self.chunks: dict[str, dict[str, dict]] = {}
        self.mappings: dict[str, dict] = {}
        self.swap_calls: list[tuple[int, str | None, int | None]] = []
        self.metadata_only_calls: list[str] = []
        self.deleted_refs: list[str] = []
        self.deleted_kbs: list[int] = []

    async def close(self) -> None:
        return None

    async def get_active_meta(self) -> dict | None:
        return dict(self.active_meta) if self.active_meta else None

    async def get_cursor(self) -> int:
        return self.cursor

    async def save_cursor(self, cursor: int) -> None:
        self.cursor = cursor

    async def create_versioned_indices(self, version: int, embedding_dims: int | None) -> tuple[str, str]:
        item_idx = f"kn_item_v{version}"
        chunk_idx = f"kn_chunk_v{version}"
        self.items.setdefault(item_idx, {})
        self.chunks.setdefault(chunk_idx, {})
        self.mappings[chunk_idx] = {"embedding_dims": embedding_dims}
        return item_idx, chunk_idx

    async def ensure_active_indices(
        self,
        embedding_model: str | None,
        embedding_dims: int | None,
    ) -> tuple[str, str]:
        if self.active_meta is None:
            item_idx, chunk_idx = await self.create_versioned_indices(1, embedding_dims)
            await self.swap_aliases(1, embedding_model, embedding_dims)
            return item_idx, chunk_idx

        active_model = self.active_meta.get("embedding_model")
        active_dims = self.active_meta.get("embedding_dims")
        item_idx = self.active_meta["item_index"]
        chunk_idx = self.active_meta["chunk_index"]
        has_vectors = any("embedding" in c for c in self.chunks.get(chunk_idx, {}).values())

        if embedding_model is None:
            if active_model is not None and has_vectors:
                raise IndexVersionConflictError()
            return item_idx, chunk_idx

        if active_model == embedding_model and (embedding_dims is None or active_dims == embedding_dims):
            return item_idx, chunk_idx

        if embedding_dims is None:
            return item_idx, chunk_idx

        if not has_vectors and (active_dims is None or active_dims == embedding_dims):
            self.mappings[chunk_idx]["embedding_dims"] = embedding_dims
            self.active_meta["embedding_model"] = embedding_model
            self.active_meta["embedding_dims"] = embedding_dims
            return item_idx, chunk_idx

        raise IndexVersionConflictError()

    async def swap_aliases(
        self,
        version: int,
        embedding_model: str | None,
        embedding_dims: int | None,
    ) -> None:
        self.swap_calls.append((version, embedding_model, embedding_dims))
        self.active_meta = {
            "version": version,
            "item_index": f"kn_item_v{version}",
            "chunk_index": f"kn_chunk_v{version}",
            "embedding_model": embedding_model,
            "embedding_dims": embedding_dims,
        }

    async def get_existing_items(self, item_idx: str, refs: list[str]) -> dict[str, dict]:
        store = self.items.get(item_idx, {})
        return {ref: dict(store[ref]) for ref in refs if ref in store}

    async def upsert_item_and_chunks(
        self,
        item_idx: str,
        chunk_idx: str,
        document: SourceDocument,
        chunks,
        index_status: int = DOC_STATUS_INDEXED,
        delete_existing_chunks: bool = True,
    ) -> None:
        key = document.canonical_key
        if delete_existing_chunks:
            to_del = [
                cid
                for cid, row in self.chunks.get(chunk_idx, {}).items()
                if (row.get("item_key") or row["ref"]) == key
            ]
            for cid in to_del:
                del self.chunks[chunk_idx][cid]
        self.items.setdefault(item_idx, {})[key] = {
            "item_key": key,
            "ref": document.ref,
            "subtype": document.subtype,
            "kb_id": document.kb_id,
            "title": document.title,
            "content_version": document.content_version or "",
            "meta_version": document.meta_version or "",
            "index_status": index_status,
            "permissions": document.acl.permissions if document.acl else None,
        }
        for c in chunks:
            row = c.model_dump()
            if row.get("embedding") is None:
                row.pop("embedding", None)
            self.chunks.setdefault(chunk_idx, {})[c.chunk_id] = row

    async def update_metadata_only(self, item_idx: str, chunk_idx: str, document: SourceDocument) -> None:
        key = document.canonical_key
        self.metadata_only_calls.append(key)
        item = self.items[item_idx][key]
        item["title"] = document.title
        item["meta_version"] = document.meta_version or ""
        item["permissions"] = document.acl.permissions if document.acl else None
        for row in self.chunks.get(chunk_idx, {}).values():
            if (row.get("item_key") or row["ref"]) == key:
                row["title"] = document.title
                row["meta_version"] = document.meta_version or ""
                row["permissions"] = document.acl.permissions if document.acl else None

    async def delete_refs(self, item_idx: str, chunk_idx: str, refs: list[str]) -> None:
        for ref in refs:
            self.deleted_refs.append(ref)
            self.items.get(item_idx, {}).pop(ref, None)
            to_del = [
                cid
                for cid, row in self.chunks.get(chunk_idx, {}).items()
                if (row.get("item_key") or row["ref"]) == ref
            ]
            for cid in to_del:
                del self.chunks[chunk_idx][cid]

    async def delete_by_kb_id(self, item_idx: str, chunk_idx: str, kb_id: int) -> None:
        self.deleted_kbs.append(kb_id)
        for ref in [r for r, v in self.items.get(item_idx, {}).items() if v.get("kb_id") == kb_id]:
            del self.items[item_idx][ref]
        for cid in [c for c, v in self.chunks.get(chunk_idx, {}).items() if v.get("kb_id") == kb_id]:
            del self.chunks[chunk_idx][cid]

    async def refresh_indices(self, *indices: str) -> None:
        return None

    async def list_item_signatures(self, item_idx: str, kb_id: int | None = None) -> dict[str, tuple[str, str]]:
        return {
            ref: (row["content_version"], row["meta_version"])
            for ref, row in self.items.get(item_idx, {}).items()
            if kb_id is None or row.get("kb_id") == kb_id
        }


class StubModelProviders:
    def __init__(self, snapshot: ModelCatalogSnapshot):
        self.current = snapshot

    async def snapshot(self) -> ModelCatalogSnapshot:
        return self.current


class StubAdapter:
    def __init__(self, dims: int = 4):
        self.dims = dims
        self.embed_calls: list[list[str]] = []

    async def embed(self, snapshot: ModelCatalogSnapshot, texts: list[str], timeout_s: float = 30.0):
        if snapshot.resolve_embedding() is None:
            return None
        self.embed_calls.append(list(texts))
        return [[0.25] * self.dims for _ in texts]


class StubKnowledgeClient:
    def __init__(self):
        self.changes_pages: list[KnowledgeChangePage] = []
        self.batch_docs: dict[str, SourceDocument] = {}
        self.export_docs: dict[str, list[SourceDocument]] = {t: [] for t in ALL_ENTITY_TYPES}
        self.status_updates: list[tuple[int, int]] = []

    async def changes(self, after_id: int = 0, limit: int = 100) -> KnowledgeChangePage:
        for page in self.changes_pages:
            if page.changes and page.changes[0].id > after_id:
                return page
        latest = self.changes_pages[-1].latest_cursor if self.changes_pages else after_id
        return KnowledgeChangePage(changes=[], next_cursor=after_id, latest_cursor=latest)

    async def export(self, entity_type: str, after_id: int = 0, limit: int = 100, kb_id: int | None = None):
        docs = [
            d
            for d in self.export_docs.get(entity_type, [])
            if d.entity_id > after_id and (kb_id is None or d.kb_id == kb_id)
        ]
        next_id = docs[-1].entity_id if docs else after_id
        return KnowledgeExportPage(documents=docs, next_after_id=next_id, has_more=False)

    async def documents_batch(self, refs: list[str], include_body: bool = True) -> KnowledgeDocumentBatch:
        found = [self.batch_docs[r] for r in refs if r in self.batch_docs]
        missing = [r for r in refs if r not in self.batch_docs]
        return KnowledgeDocumentBatch(documents=found, missing_refs=missing)

    async def update_doc_index_status(self, doc_id: int, status: int) -> None:
        self.status_updates.append((doc_id, status))


class StubFileClient:
    def __init__(self):
        self.blobs: dict[str, bytes] = {}
        self.downloads: list[str] = []

    async def download_bytes(self, object_name: str, max_bytes: int = 50_000_000) -> bytes:
        self.downloads.append(object_name)
        return self.blobs[object_name]


class StubNotifyClient:
    def __init__(self):
        self.export_list: list[SourceDocument] = []
        self.docs_by_id: dict[int, SourceDocument] = {}

    async def export_notices(self, after_id: int = 0, limit: int = 100) -> KnowledgeExportPage:
        docs = [d for d in self.export_list if d.entity_id > after_id]
        next_id = docs[-1].entity_id if docs else after_id
        return KnowledgeExportPage(documents=docs, next_after_id=next_id, has_more=False)

    async def notices_batch(self, ids: list[int]) -> KnowledgeNoticeBatch:
        found = [self.docs_by_id[i] for i in ids if i in self.docs_by_id]
        missing = [i for i in ids if i not in self.docs_by_id]
        return KnowledgeNoticeBatch(documents=found, missing_ids=missing)


def _snapshot(model: str = "text-embedding-3-small", dims: int | None = 4, enabled: bool = True) -> ModelCatalogSnapshot:
    return ModelCatalogSnapshot(
        version="1:1",
        providers=[
            {
                "providerKey": "openai",
                "displayName": "OpenAI",
                "protocol": "openai_compatible",
                "baseUrl": "https://api.example.com/v1",
                "apiKey": "sk-test",
                "models": ["text-embedding-3-small"],
                "dataEgressAllowed": True,
                "enabled": True,
            }
        ],
        logicalModels={
            "embedding": {
                "provider": "openai",
                "model": model,
                "enabled": enabled,
                "dimensions": dims,
            }
        },
    )


def _doc(ref: str, entity_type: str, entity_id: int, body: str = "正文内容", meta_v: str = "m1") -> SourceDocument:
    return SourceDocument(
        ref=ref,
        entityType=entity_type,
        entityId=entity_id,
        kbId=10,
        title=f"标题-{ref}",
        format="markdown" if entity_type == "note" else "plain",
        body=body,
        acl=SourceAcl(createBy=1, permissions="77400", dataScope=3),
        contentVersion=f"c-{body}",
        metaVersion=meta_v,
    )


async def test_incremental_handles_scanned_pdf_metadata_only_and_deletes():
    """增量管线支持扫描件回写 UNEXTRACTABLE(4)、元数据仅变更跳过重嵌以及删除清理。"""
    settings = Settings(ANYNOTE_INTERNAL_SECRET="secret")
    runtime = RuntimeConfigStore(settings.runtime_defaults())
    providers = StubModelProviders(_snapshot(dims=4))
    adapter = StubAdapter(dims=4)
    kc = StubKnowledgeClient()
    fc = StubFileClient()
    nc = StubNotifyClient()
    store = InMemoryEsStore()
    pipeline = IndexingPipeline(settings, runtime, providers, adapter, kc, fc, nc, store)  # type: ignore[arg-type]

    fc.blobs["pdf/scan.pdf"] = _blank_pdf()
    kc.batch_docs["note:1"] = _doc("note:1", "note", 1, body="第一版正文", meta_v="m1")
    kc.batch_docs["doc:2"] = SourceDocument(
        ref="doc:2",
        entityType="doc",
        entityId=2,
        kbId=10,
        title="扫描件",
        format="pdf",
        objectName="pdf/scan.pdf",
        contentVersion="hash-scan",
        metaVersion="m1",
    )
    nc.docs_by_id[3] = _doc("notice:3", "notice", 3, body="请按时交作业")

    kc.changes_pages = [
        KnowledgeChangePage(
            changes=[
                KnowledgeChangeEvent(id=1, entityType="note", entityId=1, kbId=10, operation="CREATE"),
                KnowledgeChangeEvent(id=2, entityType="doc", entityId=2, kbId=10, operation="CREATE"),
                KnowledgeChangeEvent(id=3, entityType="notice", entityId=3, kbId=10, operation="CREATE"),
            ],
            nextCursor=3,
            latestCursor=3,
        )
    ]
    assert await pipeline.run_incremental() == 3
    assert store.cursor == 3
    assert (2, DOC_STATUS_UNEXTRACTABLE) in kc.status_updates
    assert store.items["kn_item_v1"]["doc:2"]["index_status"] == DOC_STATUS_UNEXTRACTABLE
    assert "note:1#0" in store.chunks["kn_chunk_v1"]
    assert "notice:3#0" in store.chunks["kn_chunk_v1"]
    assert len(adapter.embed_calls) == 2  # note:1 与 notice:3，扫描件无文本不调用嵌入

    # 仅改元数据（权限收紧、标题调整）：content_version 不变则跳过分块与嵌入
    kc.batch_docs["note:1"] = _doc("note:1", "note", 1, body="第一版正文", meta_v="m2")
    kc.changes_pages.append(
        KnowledgeChangePage(
            changes=[
                KnowledgeChangeEvent(id=4, entityType="note", entityId=1, kbId=10, operation="UPDATE"),
                KnowledgeChangeEvent(id=5, entityType="mooc_item", entityId=9, kbId=10, operation="DELETE"),
            ],
            nextCursor=5,
            latestCursor=5,
        )
    )
    assert await pipeline.run_incremental() == 2
    assert store.metadata_only_calls == ["note:1"]
    assert len(adapter.embed_calls) == 2  # 仍为 2，证实跳过重嵌
    assert "mooc_item:9#transcript" in store.deleted_refs
    assert "mooc_item:9#summary" in store.deleted_refs


async def test_embedding_model_conflict_blocks_incremental_until_rebuild():
    """激活索引已有其它模型向量时，增量消费拒绝混写并在 rebuild 后原子切别名。"""
    settings = Settings(ANYNOTE_INTERNAL_SECRET="secret")
    runtime = RuntimeConfigStore(settings.runtime_defaults())
    providers = StubModelProviders(_snapshot(model="model-a", dims=4))
    adapter = StubAdapter(dims=4)
    kc = StubKnowledgeClient()
    fc = StubFileClient()
    nc = StubNotifyClient()
    store = InMemoryEsStore()
    pipeline = IndexingPipeline(settings, runtime, providers, adapter, kc, fc, nc, store)  # type: ignore[arg-type]

    kc.batch_docs["note:1"] = _doc("note:1", "note", 1, body="初始内容")
    kc.changes_pages = [
        KnowledgeChangePage(
            changes=[KnowledgeChangeEvent(id=1, entityType="note", entityId=1, kbId=10, operation="CREATE")],
            nextCursor=1,
            latestCursor=1,
        )
    ]
    await pipeline.run_incremental()

    # 管理员更换 Embedding 模型与维度为 model-b (8 维)，增量应拒写且不推进游标
    providers.current = _snapshot(model="model-b", dims=None)
    adapter.dims = 8
    kc.batch_docs["note:2"] = _doc("note:2", "note", 2, body="新内容")
    kc.changes_pages.append(
        KnowledgeChangePage(
            changes=[KnowledgeChangeEvent(id=2, entityType="note", entityId=2, kbId=10, operation="CREATE")],
            nextCursor=2,
            latestCursor=2,
        )
    )
    with pytest.raises(IndexVersionConflictError) as captured:
        await pipeline.run_incremental()
    assert str(captured.value) == INDEX_VERSION_CONFLICT_MESSAGE
    assert store.cursor == 1

    # 执行 rebuild：自动探测 8 维、导出全量 9 类实体、写入 v2 并原子切换别名
    kc.export_docs["note"] = [kc.batch_docs["note:1"], kc.batch_docs["note:2"]]
    nc.export_list = [_doc("notice:9", "notice", 9, body="全量通知")]
    rebuilt = await pipeline.run_rebuild()
    assert rebuilt == 3
    assert store.active_meta == {
        "version": 2,
        "item_index": "kn_item_v2",
        "chunk_index": "kn_chunk_v2",
        "embedding_model": "model-b",
        "embedding_dims": 8,
    }
    assert store.swap_calls[-1] == (2, "model-b", 8)
    assert len(store.chunks["kn_chunk_v2"]["note:2#0"]["embedding"]) == 8


async def test_reconcile_repairs_missing_and_removes_orphans():
    """reconcile 按 kb_id 补漏缺失文档并清理已被源库删除的孤儿文档。"""
    settings = Settings(ANYNOTE_INTERNAL_SECRET="secret")
    runtime = RuntimeConfigStore(settings.runtime_defaults())
    providers = StubModelProviders(_snapshot(enabled=False))
    adapter = StubAdapter()
    kc = StubKnowledgeClient()
    fc = StubFileClient()
    nc = StubNotifyClient()
    store = InMemoryEsStore()
    pipeline = IndexingPipeline(settings, runtime, providers, adapter, kc, fc, nc, store)  # type: ignore[arg-type]

    # 预置 v1 且存在已删除的孤儿 note:99
    await store.ensure_active_indices(None, None)
    await store.upsert_item_and_chunks(
        "kn_item_v1",
        "kn_chunk_v1",
        _doc("note:99", "note", 99, body="孤儿"),
        [],
    )
    kc.export_docs["note"] = [_doc("note:1", "note", 1, body="补漏笔记")]

    stats = await pipeline.run_reconcile(kb_id=10)
    assert stats["indexed"] == 1
    assert stats["deleted"] == 1
    assert "note:99" not in store.items["kn_item_v1"]
    assert "note:1" in store.items["kn_item_v1"]


async def test_mooc_item_transcript_and_summary_coexist_without_collision():
    """同一慕课条目与字幕、总结共享基础 ref 时按 canonical_key 独立存储且互不覆盖。"""
    settings = Settings(ANYNOTE_INTERNAL_SECRET="secret")
    runtime = RuntimeConfigStore(settings.runtime_defaults())
    providers = StubModelProviders(_snapshot(enabled=False))
    adapter = StubAdapter()
    kc = StubKnowledgeClient()
    fc = StubFileClient()
    nc = StubNotifyClient()
    store = InMemoryEsStore()
    pipeline = IndexingPipeline(settings, runtime, providers, adapter, kc, fc, nc, store)  # type: ignore[arg-type]

    item_doc = _doc("mooc_item:50", "mooc_item", 50, body="课程目录简介")
    transcript_doc = SourceDocument(
        ref="mooc_item:50",
        entityType="transcript",
        subtype="transcript",
        entityId=50,
        kbId=10,
        parentRef="mooc_item:50",
        title="视频字幕",
        format="srt",
        body="1\n00:00:01,000 --> 00:00:03,000\n字幕正文",
        authority="transcript",
        acl=SourceAcl(createBy=1, permissions="77400", dataScope=3),
        contentVersion="c-tr",
        metaVersion="m1",
    )
    summary_doc = SourceDocument(
        ref="mooc_item:50",
        entityType="summary",
        subtype="summary",
        entityId=50,
        kbId=10,
        parentRef="mooc_item:50",
        title="视频总结",
        format="plain",
        body="总结正文",
        authority="generated",
        acl=SourceAcl(createBy=1, permissions="77400", dataScope=3),
        contentVersion="c-sum",
        metaVersion="m1",
    )
    kc.export_docs["mooc_item"] = [item_doc]
    kc.export_docs["transcript"] = [transcript_doc]
    kc.export_docs["summary"] = [summary_doc]

    rebuilt = await pipeline.run_rebuild()
    assert rebuilt == 3
    assert set(store.items["kn_item_v1"].keys()) == {
        "mooc_item:50",
        "mooc_item:50#transcript",
        "mooc_item:50#summary",
    }
    assert set(store.chunks["kn_chunk_v1"].keys()) == {
        "mooc_item:50#0",
        "mooc_item:50#transcript#0",
        "mooc_item:50#summary#0",
    }

    reconcile_stats = await pipeline.run_reconcile(kb_id=10)
    assert reconcile_stats["skipped"] == 3
    assert reconcile_stats["deleted"] == 0
