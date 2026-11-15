"""索引管线与 ES 内存仿真单元测试。

@author 称霸幼儿园
"""

import io
from unittest.mock import AsyncMock

import pytest
from pypdf import PdfWriter

from core.config import RuntimeConfigStore, Settings
from indexing.chunking import CHUNKER_VERSION
from indexing.es_store import EMBEDDING_PROFILE_VERSION, INDEX_SCHEMA_VERSION, ElasticsearchKnowledgeStore
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
    ParsedDocument,
    ParsedSection,
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
        self.watermark_state: dict = {}
        self.failure_on_upsert: bool = False
        self.attempts: list[tuple[int, str | None]] = []
        self.cleaned_indices: list[tuple[str, str]] = []
        self.fail_on_ref: str | None = None

    is_item_complete = ElasticsearchKnowledgeStore.is_item_complete

    async def get_watermark(self):
        return dict(self.watermark_state)

    async def save_watermark(self, latest_cursor, processed_cursor, last_processed_at, last_success_at, last_error_type):
        self.cursor = processed_cursor
        self.watermark_state = {
            "cursor": processed_cursor,
            "latest_cursor": latest_cursor,
            "lag_records": max(0, latest_cursor - processed_cursor),
            "last_processed_at": last_processed_at,
            "last_success_at": last_success_at,
            "last_error_type": last_error_type,
        }

    async def close(self) -> None:
        return None

    async def get_active_meta(self) -> dict | None:
        return dict(self.active_meta) if self.active_meta else None

    async def get_cursor(self) -> int:
        return self.cursor

    async def save_cursor(self, cursor: int) -> None:
        self.cursor = cursor

    async def create_versioned_indices(self, version: int, embedding_dims: int | None, attempt_id=None) -> tuple[str, str]:
        self.attempts.append((version, attempt_id))
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
        item_idx: str | None = None,
        chunk_idx: str | None = None,
    ) -> None:
        self.swap_calls.append((version, embedding_model, embedding_dims))
        self.active_meta = {
            "version": version,
            "item_index": f"kn_item_v{version}",
            "chunk_index": f"kn_chunk_v{version}",
            "embedding_model": embedding_model,
            "embedding_dims": embedding_dims,
            "schema_version": INDEX_SCHEMA_VERSION,
            "chunker_version": CHUNKER_VERSION,
            "embedding_profile_version": EMBEDDING_PROFILE_VERSION,
        }

    async def delete_versioned_indices(self, item_idx, chunk_idx):
        self.cleaned_indices.append((item_idx, chunk_idx))
        self.items.pop(item_idx, None)
        self.chunks.pop(chunk_idx, None)

    async def get_chunk_signatures(self, chunk_idx, item_keys=None, kb_id=None):
        result = {}
        for chunk in self.chunks.get(chunk_idx, {}).values():
            key = chunk["item_key"]
            if item_keys is not None and key not in item_keys:
                continue
            if kb_id is not None and chunk.get("kb_id") != kb_id:
                continue
            generation = chunk.get("generation", "")
            bucket = result.setdefault(key, {"counts": {}, "chunker_versions": {}, "content_versions": {}, "meta_versions": {}, "readable": {}})
            bucket["counts"][generation] = bucket["counts"].get(generation, 0) + 1
            bucket["chunker_versions"].setdefault(generation, set()).add(chunk.get("chunker_version"))
            bucket["content_versions"].setdefault(generation, set()).add(chunk.get("content_version"))
            bucket["meta_versions"].setdefault(generation, set()).add(chunk.get("meta_version"))
            bucket["readable"][generation] = chunk.get("readable") is True
        return result

    async def get_vector_counts(self, chunk_idx, items):
        return {
            (key, generation): sum(
                1 for row in self.chunks.get(chunk_idx, {}).values()
                if row.get("item_key") == key and row.get("generation") == generation and "embedding" in row
            )
            for key, generation in items
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
        outline: str = "",
        summary: str = "",
    ) -> None:
        if self.failure_on_upsert or document.ref == self.fail_on_ref:
            raise RuntimeError("injected_store_failure")
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
            "readable": True,
            "generation": document.content_version or "g",
            "chunk_count": len(chunks),
            "chunker_version": CHUNKER_VERSION,
            "permissions": document.acl.permissions if document.acl else None,
            "task_member_ids": document.acl.task_member_ids if document.acl else None,
            "outline": outline,
            "summary": summary,
        }
        for c in chunks:
            row = c.model_dump()
            row["generation"] = document.content_version or "g"
            row["chunker_version"] = CHUNKER_VERSION
            row["readable"] = True
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
        item["task_member_ids"] = document.acl.task_member_ids if document.acl else None
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


async def test_embedding_input_includes_title_path_and_body():
    """Embedding 输入按确定格式包含条目标题、完整标题路径和正文。"""
    settings = Settings(ANYNOTE_INTERNAL_SECRET="secret")
    runtime = RuntimeConfigStore(settings.runtime_defaults())
    providers = StubModelProviders(_snapshot(dims=4))
    adapter = StubAdapter(dims=4)
    kc = StubKnowledgeClient()
    doc = _doc("note:1", "note", 1, body="# 一级\n\n## 二级\n\n正文内容")
    doc.title = "索引标题"
    kc.batch_docs[doc.ref] = doc
    kc.changes_pages = [
        KnowledgeChangePage(
            changes=[KnowledgeChangeEvent(id=1, entityType="note", entityId=1, kbId=10, operation="CREATE")],
            nextCursor=1,
            latestCursor=1,
        )
    ]
    store = InMemoryEsStore()
    pipeline = IndexingPipeline(
        settings, runtime, providers, adapter, kc, StubFileClient(), StubNotifyClient(), store
    )  # type: ignore[arg-type]

    await pipeline.run_incremental()

    assert adapter.embed_calls == [["标题：索引标题\n标题路径：一级 / 二级\n正文：正文内容"]]


async def test_title_only_change_reembeds_while_acl_only_change_does_not():
    """标题影响向量输入并触发重嵌，权限元数据变化只更新 ACL。"""
    settings = Settings(ANYNOTE_INTERNAL_SECRET="secret")
    runtime = RuntimeConfigStore(settings.runtime_defaults())
    providers = StubModelProviders(_snapshot(dims=4))
    adapter = StubAdapter(dims=4)
    kc = StubKnowledgeClient()
    first = _doc("note:1", "note", 1, body="# 小节\n正文")
    kc.batch_docs[first.ref] = first
    kc.changes_pages = [
        KnowledgeChangePage(
            changes=[KnowledgeChangeEvent(id=1, entityType="note", entityId=1, kbId=10, operation="CREATE")],
            nextCursor=1,
            latestCursor=1,
        )
    ]
    store = InMemoryEsStore()
    pipeline = IndexingPipeline(
        settings, runtime, providers, adapter, kc, StubFileClient(), StubNotifyClient(), store
    )  # type: ignore[arg-type]
    await pipeline.run_incremental()

    renamed = _doc("note:1", "note", 1, body="# 小节\n正文", meta_v="m2")
    renamed.title = "新标题-note:1"
    kc.batch_docs[renamed.ref] = renamed
    kc.changes_pages.append(
        KnowledgeChangePage(
            changes=[KnowledgeChangeEvent(id=2, entityType="note", entityId=1, kbId=10, operation="UPDATE")],
            nextCursor=2,
            latestCursor=2,
        )
    )
    await pipeline.run_incremental()
    assert len(adapter.embed_calls) == 2
    assert "标题：新标题-note:1" in adapter.embed_calls[-1][0]

    acl_changed = _doc("note:1", "note", 1, body="# 小节\n正文", meta_v="m3")
    acl_changed.title = renamed.title
    acl_changed.acl = SourceAcl(createBy=1, permissions="77400", dataScope=3, taskMemberIds=[2])
    kc.batch_docs[acl_changed.ref] = acl_changed
    kc.changes_pages.append(
        KnowledgeChangePage(
            changes=[KnowledgeChangeEvent(id=3, entityType="note", entityId=1, kbId=10, operation="UPDATE")],
            nextCursor=3,
            latestCursor=3,
        )
    )
    await pipeline.run_incremental()
    assert len(adapter.embed_calls) == 2
    assert store.metadata_only_calls == ["note:1"]


async def test_disabling_embedding_keeps_active_profile_and_reenable_reconciles_missing_vectors():
    """停用向量后增量继续推进并保留指纹，重开后对账补齐停用期片段。"""
    settings = Settings(ANYNOTE_INTERNAL_SECRET="secret")
    runtime = RuntimeConfigStore(settings.runtime_defaults())
    providers = StubModelProviders(_snapshot(model="model-a", dims=4))
    adapter = StubAdapter(dims=4)
    kc = StubKnowledgeClient()
    first = _doc("note:1", "note", 1, body="启用期间")
    kc.batch_docs[first.ref] = first
    kc.changes_pages = [
        KnowledgeChangePage(
            changes=[KnowledgeChangeEvent(id=1, entityType="note", entityId=1, kbId=10, operation="CREATE")],
            nextCursor=1,
            latestCursor=1,
        )
    ]
    store = InMemoryEsStore()
    pipeline = IndexingPipeline(
        settings, runtime, providers, adapter, kc, StubFileClient(), StubNotifyClient(), store
    )  # type: ignore[arg-type]
    await pipeline.run_incremental()
    initial_profile = (store.active_meta["embedding_model"], store.active_meta["embedding_dims"])

    providers.current = _snapshot(model="model-a", dims=4, enabled=False)
    second = _doc("note:2", "note", 2, body="停用期间")
    kc.batch_docs[second.ref] = second
    kc.changes_pages.append(
        KnowledgeChangePage(
            changes=[KnowledgeChangeEvent(id=2, entityType="note", entityId=2, kbId=10, operation="CREATE")],
            nextCursor=2,
            latestCursor=2,
        )
    )
    assert await pipeline.run_incremental() == 1
    assert store.cursor == 2
    assert (store.active_meta["embedding_model"], store.active_meta["embedding_dims"]) == initial_profile
    assert "embedding" in store.chunks["kn_chunk_v1"]["note:1#0"]
    assert "embedding" not in store.chunks["kn_chunk_v1"]["note:2#0"]

    providers.current = _snapshot(model="model-a", dims=4, enabled=True)
    kc.export_docs["note"] = [first, second]
    stats = await pipeline.run_reconcile()
    assert stats["indexed"] == 1
    assert stats["skipped"] == 1
    assert "embedding" in store.chunks["kn_chunk_v1"]["note:2#0"]


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
        "schema_version": INDEX_SCHEMA_VERSION,
        "chunker_version": CHUNKER_VERSION,
        "embedding_profile_version": EMBEDDING_PROFILE_VERSION,
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


def _regression_pipeline():
    """构造关闭向量计算的索引管线及可注入故障的依赖。

    :return: 管线、知识源、文件源和内存索引
    @author 称霸幼儿园
    """
    settings = Settings(ANYNOTE_INTERNAL_SECRET="secret")
    knowledge = StubKnowledgeClient()
    files = StubFileClient()
    store = InMemoryEsStore()
    pipeline = IndexingPipeline(
        settings, RuntimeConfigStore(settings.runtime_defaults()), StubModelProviders(_snapshot(enabled=False)),
        StubAdapter(), knowledge, files, StubNotifyClient(), store,
    )  # type: ignore[arg-type]
    return pipeline, knowledge, files, store


async def test_incremental_empty_round_refreshes_watermark_and_catchup_clears_lag():
    """空轮刷新源水位和处理时间，追平变更后游标差归零。

    @author 称霸幼儿园
    """
    pipeline, knowledge, _files, store = _regression_pipeline()
    store.cursor = 3
    store.watermark_state = {"last_processed_at": "old", "last_success_at": "old"}
    knowledge.changes_pages = [KnowledgeChangePage(changes=[], nextCursor=3, latestCursor=8)]

    assert await pipeline.run_incremental() == 0
    empty = await pipeline.watermark()
    assert (empty["processed_cursor"], empty["latest_cursor"], empty["lag_records"]) == (3, 8, 5)
    assert empty["last_processed_at"] != "old"
    assert empty["last_success_at"] == empty["last_processed_at"]
    assert empty["last_error_type"] is None
    assert empty["chunker_version"] == CHUNKER_VERSION
    assert empty["embedding_profile_version"] == EMBEDDING_PROFILE_VERSION

    knowledge.changes_pages.append(KnowledgeChangePage(
        changes=[KnowledgeChangeEvent(id=8, entityType="note", entityId=8, operation="DELETE")],
        nextCursor=8, latestCursor=8,
    ))
    assert await pipeline.run_incremental() == 1
    caught_up = await pipeline.watermark()
    assert (caught_up["processed_cursor"], caught_up["latest_cursor"], caught_up["lag_records"]) == (8, 8, 0)
    assert caught_up["last_processed_at"] >= empty["last_processed_at"]
    assert caught_up["last_success_at"] == caught_up["last_processed_at"]


async def test_incremental_store_failure_preserves_cursor_success_time_and_doc_status():
    """存储失败不提交游标或已索引状态，并保留最后成功时间供重试使用。

    @author 称霸幼儿园
    """
    pipeline, knowledge, _files, store = _regression_pipeline()
    assert await pipeline.run_incremental() == 0
    last_success = (await pipeline.watermark())["last_success_at"]
    document = _doc("doc:7", "doc", 7)
    knowledge.batch_docs[document.ref] = document
    knowledge.changes_pages = [KnowledgeChangePage(
        changes=[KnowledgeChangeEvent(id=7, entityType="doc", entityId=7, operation="CREATE")],
        nextCursor=7, latestCursor=7,
    )]
    pipeline._adapter.extract_document = AsyncMock(return_value=ParsedDocument(sections=[ParsedSection(text="正文")]))
    store.failure_on_upsert = True

    with pytest.raises(RuntimeError, match="injected_store_failure"):
        await pipeline.run_incremental()

    failed = await pipeline.watermark()
    assert store.cursor == 0
    assert knowledge.status_updates == []
    assert "doc:7" not in store.items["kn_item_v1"]
    assert (failed["processed_cursor"], failed["latest_cursor"], failed["lag_records"]) == (0, 7, 7)
    assert failed["last_error_type"] == "RuntimeError"
    assert failed["last_success_at"] == last_success

    store.failure_on_upsert = False
    assert await pipeline.run_incremental() == 1
    assert store.cursor == 7
    assert knowledge.status_updates == [(7, DOC_STATUS_INDEXED)]
    recovered = await pipeline.watermark()
    assert recovered["last_error_type"] is None
    assert recovered["lag_records"] == 0
    assert recovered["last_success_at"] > last_success


async def test_reconcile_preserves_scanned_pdf_status_on_second_round():
    """扫描 PDF 第二轮对账保持无法提取状态，不误回写为已索引。

    @author 称霸幼儿园
    """
    pipeline, knowledge, files, store = _regression_pipeline()
    document = SourceDocument(
        ref="doc:2", entityType="doc", entityId=2, kbId=10, title="扫描件", format="pdf",
        objectName="pdf/scan.pdf", contentVersion="hash-scan", metaVersion="m1", attributes={"indexStatus": 3},
    )
    knowledge.export_docs["doc"] = [document]
    files.blobs["pdf/scan.pdf"] = _blank_pdf()

    first = await pipeline.run_reconcile()
    second = await pipeline.run_reconcile()

    assert first["unextractable"] == 1
    assert second["skipped"] == 1
    assert second["indexed"] == second["unextractable"] == second["failed"] == 0
    assert knowledge.status_updates == [(2, DOC_STATUS_UNEXTRACTABLE), (2, DOC_STATUS_UNEXTRACTABLE)]
    assert store.items["kn_item_v1"]["doc:2"]["index_status"] == DOC_STATUS_UNEXTRACTABLE
    assert files.downloads == ["pdf/scan.pdf"]


@pytest.mark.parametrize("corruption", ["missing", "extra", "generation", "content", "metadata", "chunker"])
async def test_reconcile_repairs_chunk_corruption_and_chunk_only_orphan(corruption):
    """对账修复分片完整性损坏及孤儿，第二轮只跳过已完整条目。

    @author 称霸幼儿园
    """
    pipeline, knowledge, _files, store = _regression_pipeline()
    document = _doc("note:1", "note", 1)
    knowledge.export_docs["note"] = [document]
    assert (await pipeline.run_reconcile())["indexed"] == 1
    chunks = store.chunks["kn_chunk_v1"]
    original = dict(chunks["note:1#0"])
    if corruption == "missing":
        chunks.pop("note:1#0")
    elif corruption == "extra":
        chunks["note:1#extra"] = {**original, "chunk_index": 99}
    else:
        field = {"generation": "generation", "content": "content_version", "metadata": "meta_version",
                 "chunker": "chunker_version"}[corruption]
        chunks["note:1#0"][field] = "incorrect"
    chunks["note:99#0"] = {**original, "item_key": "note:99", "ref": "note:99"}

    repaired = await pipeline.run_reconcile()
    signatures = await store.get_chunk_signatures("kn_chunk_v1")
    assert repaired["indexed"] == 1
    assert repaired["deleted"] == 1
    assert set(signatures) == {document.canonical_key}
    assert await store.is_item_complete(store.items["kn_item_v1"][document.canonical_key],
                                        signatures[document.canonical_key], None, False)
    assert set(chunks) == {"note:1#0"}

    repeated = await pipeline.run_reconcile()
    assert repeated == {"indexed": 0, "meta_updated": 0, "skipped": 1, "deleted": 0, "unextractable": 0, "failed": 0}


async def test_rebuild_store_failure_keeps_active_alias_and_cleans_attempt_before_retry():
    """重建部分写入失败保留旧索引和游标，清理尝试后重试不携带残留。

    @author 称霸幼儿园
    """
    pipeline, knowledge, _files, store = _regression_pipeline()
    old = _doc("note:10", "note", 10, body="旧索引内容")
    knowledge.export_docs["note"] = [old]
    assert await pipeline.run_rebuild() == 1
    active = dict(store.active_meta)
    store.cursor = 3
    swaps = list(store.swap_calls)
    first = _doc("note:1", "note", 1, body="失败尝试遗留")
    second = _doc("note:2", "note", 2, body="写入时失败")
    knowledge.export_docs["note"] = [first, second]
    knowledge.changes_pages = [KnowledgeChangePage(changes=[], nextCursor=0, latestCursor=9)]
    store.fail_on_ref = second.ref

    with pytest.raises(RuntimeError, match="injected_store_failure"):
        await pipeline.run_rebuild()

    assert store.active_meta == active
    assert store.swap_calls == swaps
    assert store.cursor == 3
    assert store.items[active["item_index"]][old.ref]["content_version"] == old.content_version
    assert store.chunks[active["chunk_index"]]["note:10#0"]["content"] == old.body
    assert store.cleaned_indices == [("kn_item_v2", "kn_chunk_v2")]
    assert "kn_item_v2" not in store.items and "kn_chunk_v2" not in store.chunks

    store.fail_on_ref = None
    knowledge.export_docs["note"] = [second]
    assert await pipeline.run_rebuild() == 1
    assert store.cursor == 9
    assert set(store.items["kn_item_v2"]) == {second.ref}
    assert set(store.chunks["kn_chunk_v2"]) == {"note:2#0"}
    attempts = [attempt for version, attempt in store.attempts if version == 2]
    assert len(attempts) == len(set(attempts)) == 2
    assert all(attempts)


async def test_empty_document_with_zero_chunks_is_complete_and_skipped():
    """空正文的零片段条目属于合法完整索引，重复对账不会反复重建。

    @author 称霸幼儿园
    """
    pipeline, knowledge, _files, store = _regression_pipeline()
    knowledge.export_docs["note"] = [_doc("note:1", "note", 1, body="")]
    first = await pipeline.run_reconcile()
    assert first["indexed"] == 1
    assert store.items["kn_item_v1"]["note:1"]["chunk_count"] == 0
    assert await store.get_chunk_signatures("kn_chunk_v1") == {}
    second = await pipeline.run_reconcile()
    assert second["skipped"] == 1
    assert second["indexed"] == second["meta_updated"] == second["deleted"] == 0


@pytest.mark.parametrize("failure_stage", ["second_document", "verification", "alias"])
async def test_rebuild_does_not_publish_doc_status_before_complete_commit(failure_stage):
    """重建写入、独立核验或切换失败时，不回写任何资料成功状态。

    @author 称霸幼儿园
    """
    pipeline, knowledge, _files, store = _regression_pipeline()
    await store.ensure_active_indices(None, None)
    store.cursor = 3
    previous = dict(store.active_meta)
    knowledge.export_docs["doc"] = [_doc("doc:1", "doc", 1), _doc("doc:2", "doc", 2)]
    pipeline._adapter.extract_document = AsyncMock(return_value=ParsedDocument(sections=[ParsedSection(text="正文")]))
    if failure_stage == "second_document":
        store.fail_on_ref = "doc:2"
    elif failure_stage == "verification":
        pipeline._verify_source_documents = AsyncMock(side_effect=RuntimeError("injected_verification_failure"))
    else:
        store.swap_aliases = AsyncMock(side_effect=RuntimeError("injected_alias_failure"))

    with pytest.raises(RuntimeError, match="injected_"):
        await pipeline.run_rebuild()

    assert knowledge.status_updates == []
    assert store.active_meta == previous
    assert store.cursor == 3
    assert "kn_item_v2" not in store.items and "kn_chunk_v2" not in store.chunks


async def test_rebuild_publishes_doc_status_and_watermark_after_commit():
    """重建提交新版本和水位后，才回写普通资料与扫描件的最终状态。

    @author 称霸幼儿园
    """
    pipeline, knowledge, _files, store = _regression_pipeline()
    store.watermark_state = {"cursor": 3, "latest_cursor": 8, "lag_records": 5, "last_error_type": "OldError"}
    knowledge.changes_pages = [KnowledgeChangePage(changes=[], nextCursor=3, latestCursor=8)]
    knowledge.export_docs["doc"] = [_doc("doc:1", "doc", 1), _doc("doc:2", "doc", 2)]
    pipeline._adapter.extract_document = AsyncMock(side_effect=[
        ParsedDocument(sections=[ParsedSection(text="正文")]), ParsedDocument(unextractable=True),
    ])
    observed = []

    async def observe_status(doc_id, status):
        """捕获资料状态回写时已激活的索引版本与水位。"""
        observed.append((doc_id, status, store.active_meta["version"], store.cursor))

    knowledge.update_doc_index_status = observe_status
    assert await pipeline.run_rebuild() == 2

    assert observed == [(1, DOC_STATUS_INDEXED, 1, 8), (2, DOC_STATUS_UNEXTRACTABLE, 1, 8)]
    watermark = await pipeline.watermark()
    assert (watermark["processed_cursor"], watermark["latest_cursor"], watermark["lag_records"]) == (8, 8, 0)
    assert watermark["last_error_type"] is None
    assert watermark["last_success_at"] == watermark["last_processed_at"]
    assert watermark["last_success_at"]


@pytest.mark.parametrize("failure_stage", ["watermark", "source_status"])
async def test_rebuild_post_activation_failure_preserves_new_index_for_recovery(failure_stage):
    """激活后水位或源状态回写失败保留新索引，对账能够补写资料状态。

    @author 称霸幼儿园
    """
    pipeline, knowledge, _files, store = _regression_pipeline()
    document = _doc("doc:1", "doc", 1)
    knowledge.export_docs["doc"] = [document]
    pipeline._adapter.extract_document = AsyncMock(return_value=ParsedDocument(sections=[ParsedSection(text="正文")]))
    if failure_stage == "watermark":
        store.save_watermark = AsyncMock(side_effect=RuntimeError("injected_watermark_failure"))
    else:
        knowledge.update_doc_index_status = AsyncMock(side_effect=RuntimeError("injected_status_failure"))

    with pytest.raises(RuntimeError, match="injected_"):
        await pipeline.run_rebuild()

    assert store.active_meta["item_index"] == "kn_item_v1"
    assert document.ref in store.items["kn_item_v1"]
    assert store.chunks["kn_chunk_v1"]["doc:1#0"]["content"] == "正文"
    assert store.cleaned_indices == []
    knowledge.update_doc_index_status = AsyncMock()
    result = await pipeline.run_reconcile()
    assert result["skipped"] == 1 and result["indexed"] == 0
    knowledge.update_doc_index_status.assert_awaited_once_with(1, DOC_STATUS_INDEXED)
