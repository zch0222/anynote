"""Elasticsearch 索引写入与完整性回归测试。

@author 称霸幼儿园
"""

import os
from copy import deepcopy
from uuid import uuid4

import pytest
from elasticsearch import AsyncElasticsearch
from elasticsearch import ApiError

import indexing.es_store as es_module
from core.config import RuntimeConfigStore, Settings
from indexing.es_store import ElasticsearchKnowledgeStore, _build_chunk_mappings, _build_item_mappings
from indexing.models import (
    DOC_STATUS_INDEXED,
    ChunkPayload,
    IndexVersionConflictError,
    KnowledgeChangeEvent,
    KnowledgeChangePage,
    SourceAcl,
    SourceDocument,
)
from indexing.pipeline import IndexingPipeline
from indexing.parsers.pdf import PDF_EXTRACTOR_VERSION
from tests.pdf_samples import make_pdf_sample
from tests.test_indexing_parsers_chunking import _make_text_pdf_bytes
from tests.test_indexing_pipeline import (
    StubAdapter,
    StubFileClient,
    StubKnowledgeClient,
    StubModelProviders,
    StubNotifyClient,
    _snapshot,
)


def _document(content_version: str, body: str) -> SourceDocument:
    """构造带固定 ACL 的索引文档。"""
    return SourceDocument(
        ref="note:1",
        entity_type="note",
        entity_id=1,
        kb_id=10,
        title="索引回归",
        format="plain",
        body=body,
        acl=SourceAcl(create_by=1, permissions="77400", data_scope=3),
        content_version=content_version,
        meta_version="m1",
    )


def _chunk(chunk_id: str, content_version: str, embedding: list[float]) -> ChunkPayload:
    """构造指定向量维度的索引片段。"""
    return ChunkPayload(
        chunk_id=chunk_id,
        item_key="note:1",
        ref="note:1",
        entity_type="note",
        entity_id=1,
        kb_id=10,
        chunk_index=int(chunk_id.rsplit("#", 1)[-1]),
        title="索引回归",
        content="索引正文",
        content_version=content_version,
        meta_version="m1",
        create_by=1,
        permissions="77400",
        data_scope=3,
        embedding=embedding,
    )


async def test_bulk_chunk_failure_keeps_previous_generation_searchable():
    """bulk 中间片段失败时抛错并保留旧条目与旧片段。"""
    es_url = os.getenv("INDEXING_ES_URL")
    if not es_url:
        pytest.skip("INDEXING_ES_URL 未配置")

    suffix = uuid4().hex
    item_index = f"kn_item_it_{suffix}"
    chunk_index = f"kn_chunk_it_{suffix}"
    client = AsyncElasticsearch(es_url)
    store = ElasticsearchKnowledgeStore(client)
    try:
        await client.indices.create(index=item_index, mappings=_build_item_mappings())
        await client.indices.create(index=chunk_index, mappings=_build_chunk_mappings(2))

        await store.upsert_item_and_chunks(
            item_index,
            chunk_index,
            _document("c1", "旧正文"),
            [_chunk("note:1#old#0", "c1", [0.1, 0.2])],
            delete_existing_chunks=False,
        )
        await client.indices.refresh(index=chunk_index)
        original_chunks = await client.search(index=chunk_index, query={"term": {"item_key": "note:1"}}, size=10)
        original_ids = [hit["_id"] for hit in original_chunks["hits"]["hits"]]

        replacement = [
            _chunk("note:1#new#0", "c2", [0.2, 0.3]),
            _chunk("note:1#new#1", "c2", [0.1, 0.2, 0.3]),
            _chunk("note:1#new#2", "c2", [0.3, 0.4]),
        ]
        with pytest.raises(RuntimeError):
            await store.upsert_item_and_chunks(
                item_index,
                chunk_index,
                _document("c2", "新正文"),
                replacement,
            )

        await client.indices.refresh(index=f"{item_index},{chunk_index}")
        item = await client.get(index=item_index, id="note:1")
        chunks = await client.search(index=chunk_index, query={"term": {"item_key": "note:1"}}, size=10)
        assert item["_source"]["content_version"] == "c1"
        assert [hit["_id"] for hit in chunks["hits"]["hits"]] == original_ids
    finally:
        await client.indices.delete(index=f"{item_index},{chunk_index}", ignore_unavailable=True)
        await client.close()


class FaultClient:
    """透传真实 ES 请求并单次注入指定写入故障。

    @author 称霸幼儿园
    """

    def __init__(self, client):
        self.client = client
        self.fault = None
        self.indices = FaultIndices(client.indices, self)

    def __getattr__(self, name):
        return getattr(self.client, name)

    async def bulk(self, **kwargs):
        """通过错误字段类型或维度制造真实 bulk 单项错误。"""
        operations = deepcopy(kwargs["operations"])
        target = operations[0]["index"]["_index"]
        if self.fault == "item_bulk" and target.startswith(es_module.ITEM_ALIAS):
            operations[1]["entity_id"] = "invalid-entity-id"
            self.fault = None
        elif self.fault == "middle_chunk" and target.startswith(es_module.CHUNK_ALIAS):
            assert len(operations) >= 6
            operations[3]["embedding"] = [0.1, 0.2, 0.3]
            self.fault = None
        return await self.client.bulk(**{**kwargs, "operations": operations})

    async def update_by_query(self, **kwargs):
        """元数据更新完成后注入响应丢失。"""
        response = await self.client.update_by_query(**kwargs)
        if self.fault == "metadata" and "params.kb_id" in kwargs["script"]["source"]:
            self.fault = None
            raise RuntimeError("injected_metadata_response_failure")
        return response

    async def delete_by_query(self, **kwargs):
        """片段删除完成后注入响应丢失。"""
        response = await self.client.delete_by_query(**kwargs)
        if self.fault == "delete" and kwargs["index"].startswith(es_module.CHUNK_ALIAS):
            self.fault = None
            raise RuntimeError("injected_delete_response_failure")
        return response

    async def index(self, **kwargs):
        """在激活元数据提交前或提交后注入请求异常。"""
        is_active = kwargs.get("index") == es_module.META_INDEX and kwargs.get("id") == es_module.META_ACTIVE_DOC_ID
        if is_active and self.fault in {"meta_before", "meta_restore_fail"}:
            failure = self.fault
            if failure == "meta_before":
                self.fault = None
            raise RuntimeError(f"injected_{failure}")
        response = await self.client.index(**kwargs)
        if is_active and self.fault in {"meta_after", "meta_after_restore_fails"}:
            failure = self.fault
            self.fault = "meta_restore_fail" if failure == "meta_after_restore_fails" else None
            raise RuntimeError(f"injected_{failure}")
        return response


class FaultIndices:
    """透传索引 API，并注入别名提交或恢复失败。

    @author 称霸幼儿园
    """

    def __init__(self, indices, owner):
        self.indices = indices
        self.owner = owner

    def __getattr__(self, name):
        return getattr(self.indices, name)

    async def update_aliases(self, **kwargs):
        """在别名更新前后注入异常，支持恢复请求持续失败。"""
        if self.owner.fault in {"alias_before", "alias_restore_fail"}:
            failure = self.owner.fault
            if failure == "alias_before":
                self.owner.fault = None
            raise RuntimeError(f"injected_{failure}")
        response = await self.indices.update_aliases(**kwargs)
        if self.owner.fault in {"alias_after", "alias_after_restore_fails"}:
            failure = self.owner.fault
            self.owner.fault = "alias_restore_fail" if failure == "alias_after_restore_fails" else None
            raise RuntimeError(f"injected_{failure}")
        return response


@pytest.fixture
async def isolated_es(monkeypatch):
    """创建随机命名空间，结束后按精确名称清理临时索引。"""
    es_url = os.getenv("INDEXING_ES_URL")
    if not es_url:
        pytest.skip("INDEXING_ES_URL 未配置")
    prefix = f"m164_it_{uuid4().hex}"
    monkeypatch.setattr(es_module, "ITEM_ALIAS", f"{prefix}_item")
    monkeypatch.setattr(es_module, "CHUNK_ALIAS", f"{prefix}_chunk")
    monkeypatch.setattr(es_module, "META_INDEX", f"{prefix}_meta")
    client = AsyncElasticsearch(es_url)
    proxy = FaultClient(client)
    store = ElasticsearchKnowledgeStore(proxy)
    try:
        yield client, proxy, store, prefix
    finally:
        try:
            indices = await client.indices.get(index=f"{prefix}*")
            if indices:
                await client.indices.delete(index=",".join(indices))
        except ApiError as error:
            if error.status_code != 404:
                raise
        finally:
            await client.close()


def _pipeline(store, knowledge, embeddings=False):
    """装配真实 ES 存储与确定性的权威源、模型替身。"""
    settings = Settings(_env_file=None, ANYNOTE_INTERNAL_SECRET="test-secret")
    files = StubFileClient()
    pipeline = IndexingPipeline(
        settings=settings,
        runtime_store=RuntimeConfigStore(settings.runtime_defaults()),
        model_provider_client=StubModelProviders(_snapshot(dims=2, enabled=embeddings)),
        model_adapter=StubAdapter(dims=2),
        knowledge_client=knowledge,
        file_client=files,
        notify_client=StubNotifyClient(),
        es_store=store,
    )
    return pipeline, files


async def _readable_hits(client, index):
    """读取刷新后可供检索召回的文档。"""
    await client.indices.refresh(index=index)
    response = await client.search(index=index, query={"term": {"readable": True}}, size=100)
    return response["hits"]["hits"]


@pytest.mark.parametrize("fault", ["item_bulk", "middle_chunk"])
async def test_incremental_bulk_failure_preserves_cursor_status_and_old_generation(isolated_es, fault):
    """真实 bulk 单项失败不推进游标、不回写成功，重试后清除残余代际。"""
    client, proxy, store, _prefix = isolated_es
    knowledge = StubKnowledgeClient()
    pipeline, files = _pipeline(store, knowledge, embeddings=True)
    item_index, chunk_index = await store.ensure_active_indices("text-embedding-3-small", 2)
    document = _document("c2", "unused").model_copy(update={
        "ref": "doc:1", "entity_type": "doc", "format": "pdf", "object_name": "regression.pdf",
    })
    old_document = document.model_copy(update={"content_version": "c1"})
    old_chunk = _chunk("doc:1#0", "c1", [0.1, 0.2]).model_copy(update={
        "item_key": "doc:1", "ref": "doc:1", "entity_type": "doc", "content": "previous readable body",
    })
    await store.upsert_item_and_chunks(item_index, chunk_index, old_document, [old_chunk])
    old_hits = await _readable_hits(client, chunk_index)
    old_ids = [hit["_id"] for hit in old_hits]
    files.blobs["regression.pdf"] = _make_text_pdf_bytes("new indexed text " * 120)
    knowledge.batch_docs["doc:1"] = document
    knowledge.changes_pages = [KnowledgeChangePage(
        changes=[KnowledgeChangeEvent(id=1, entity_type="doc", entity_id=1, operation="UPDATE")],
        next_cursor=1, latest_cursor=1,
    )]
    proxy.fault = fault

    with pytest.raises(RuntimeError):
        await pipeline.run_incremental()

    assert await store.get_cursor() == 0
    assert (1, DOC_STATUS_INDEXED) not in knowledge.status_updates
    assert (await client.get(index=item_index, id="doc:1"))["_source"]["content_version"] == "c1"
    hits = await _readable_hits(client, chunk_index)
    assert [hit["_id"] for hit in hits] == old_ids
    assert all(hit["_source"]["content"] == "previous readable body" for hit in hits)
    signatures = await store.get_chunk_signatures(chunk_index)
    assert sum(signatures["doc:1"]["counts"].values()) == 1

    assert await pipeline.run_incremental() == 1
    assert await store.get_cursor() == 1
    assert knowledge.status_updates == [(1, DOC_STATUS_INDEXED)]
    assert (await client.get(index=item_index, id="doc:1"))["_source"]["content_version"] == "c2"
    assert len((await store.get_chunk_signatures(chunk_index))["doc:1"]["counts"]) == 1
    assert await pipeline.run_incremental() == 0


async def test_metadata_failure_stays_unreadable_until_retry(isolated_es):
    """权限元数据更新中途失败时保持不可召回，重试后 ACL 一致且可读。"""
    client, proxy, store, _prefix = isolated_es
    item_index, chunk_index = await store.ensure_active_indices(None, None)
    document = _document("c1", "正文")
    await store.upsert_item_and_chunks(item_index, chunk_index, document, [_chunk("note:1#0", "c1", [0.1, 0.2])])
    changed = document.model_copy(update={
        "meta_version": "m2", "acl": SourceAcl(create_by=1, permissions="70000", data_scope=1),
    })
    proxy.fault = "metadata"

    with pytest.raises(RuntimeError, match="injected_metadata"):
        await store.update_metadata_only(item_index, chunk_index, changed)

    assert await _readable_hits(client, chunk_index) == []
    assert await _readable_hits(client, item_index) == []
    await store.update_metadata_only(item_index, chunk_index, changed)
    await store.refresh_indices(item_index, chunk_index)
    item = (await client.get(index=item_index, id="note:1"))["_source"]
    hits = await _readable_hits(client, chunk_index)
    assert item["readable"] is True
    assert item["permissions"] == "70000"
    assert item["meta_version"] == "m2"
    assert len(hits) == 1
    assert hits[0]["_source"]["permissions"] == "70000"
    assert hits[0]["_source"]["meta_version"] == "m2"


async def test_delete_failure_stays_unreadable_and_retry_removes_everything(isolated_es):
    """删除中途响应丢失时不可召回，重试后条目和片段均为零。"""
    client, proxy, store, _prefix = isolated_es
    item_index, chunk_index = await store.ensure_active_indices(None, None)
    await store.upsert_item_and_chunks(item_index, chunk_index, _document("c1", "正文"), [_chunk("note:1#0", "c1", [0.1, 0.2])])
    proxy.fault = "delete"

    with pytest.raises(RuntimeError, match="injected_delete"):
        await store.delete_refs(item_index, chunk_index, ["note:1"])

    assert await _readable_hits(client, chunk_index) == []
    assert await _readable_hits(client, item_index) == []
    await store.delete_refs(item_index, chunk_index, ["note:1"])
    await store.delete_refs(item_index, chunk_index, ["note:1"])
    assert (await client.count(index=item_index))["count"] == 0
    assert (await client.count(index=chunk_index))["count"] == 0


async def test_real_reconcile_repairs_corruption_and_second_run_has_no_repairs(isolated_es):
    """真实对账修复缺片、多片、版本错误和孤儿，第二次执行零修复。"""
    client, _proxy, store, _prefix = isolated_es
    knowledge = StubKnowledgeClient()
    pipeline, _files = _pipeline(store, knowledge)
    docs = [_document(f"c{i}", f"正文{i}").model_copy(update={"ref": f"note:{i}", "entity_id": i}) for i in range(1, 5)]
    knowledge.export_docs["note"] = docs
    assert await pipeline.run_rebuild() == 4
    active = await store.get_active_meta()
    item_index, chunk_index = active["item_index"], active["chunk_index"]
    rows = (await client.search(index=chunk_index, size=100))["hits"]["hits"]
    by_key = {row["_source"]["item_key"]: row for row in rows}
    await client.delete(index=chunk_index, id=by_key["note:1"]["_id"], refresh=True)
    extra = {**by_key["note:2"]["_source"], "chunk_id": "extra-chunk", "chunk_index": 99}
    await client.index(index=chunk_index, id="extra-chunk", document=extra, refresh=True)
    await client.update(index=chunk_index, id=by_key["note:3"]["_id"], doc={"content_version": "wrong"}, refresh=True)
    await client.update(index=chunk_index, id=by_key["note:4"]["_id"], doc={"meta_version": "wrong"}, refresh=True)
    orphan = {**by_key["note:2"]["_source"], "item_key": "note:99", "ref": "note:99", "chunk_id": "orphan"}
    await client.index(index=chunk_index, id="orphan", document=orphan, refresh=True)

    result = await pipeline.run_reconcile()

    assert result["indexed"] == 4
    assert result["deleted"] == 1
    assert (await client.count(index=chunk_index))["count"] == 4
    assert set(await store.get_chunk_signatures(chunk_index)) == {doc.canonical_key for doc in docs}
    second = await pipeline.run_reconcile()
    assert second == {"indexed": 0, "meta_updated": 0, "skipped": 4, "deleted": 0, "unextractable": 0, "failed": 0}


async def test_rebuild_failure_preserves_alias_cursor_and_cleans_attempt(isolated_es):
    """重建写入失败保留旧别名和游标、清理失败现场，重试后正常切换。"""
    client, proxy, store, prefix = isolated_es
    knowledge = StubKnowledgeClient()
    pipeline, _files = _pipeline(store, knowledge)
    document = _document("c1", "旧正文")
    knowledge.export_docs["note"] = [document]
    assert await pipeline.run_rebuild() == 1
    old_active = await store.get_active_meta()
    await store.save_cursor(7)
    knowledge.changes_pages = [KnowledgeChangePage(changes=[], next_cursor=0, latest_cursor=11)]
    knowledge.export_docs["note"] = [document.model_copy(update={"content_version": "c2", "body": "新正文"})]
    proxy.fault = "item_bulk"

    with pytest.raises(RuntimeError):
        await pipeline.run_rebuild()

    assert await store.get_active_meta() == old_active
    assert await store.get_cursor() == 7
    assert set(await client.indices.get_alias(name=es_module.ITEM_ALIAS)) == {old_active["item_index"]}
    assert set(await client.indices.get_alias(name=es_module.CHUNK_ALIAS)) == {old_active["chunk_index"]}
    assert set(await client.indices.get(index=f"{prefix}*")) == {
        old_active["item_index"], old_active["chunk_index"], es_module.META_INDEX,
    }
    assert (await _readable_hits(client, old_active["chunk_index"]))[0]["_source"]["content"] == "旧正文"

    assert await pipeline.run_rebuild() == 1
    new_active = await store.get_active_meta()
    assert new_active["item_index"] != old_active["item_index"]
    assert await store.get_cursor() == 11
    assert (await _readable_hits(client, new_active["chunk_index"]))[0]["_source"]["content"] == "新正文"
    assert set(await client.indices.get(index=f"{prefix}*")) == {
        new_active["item_index"], new_active["chunk_index"], es_module.META_INDEX,
    }


async def test_embedding_runtime_transitions_preserve_and_repair_real_vectors(isolated_es):
    """向量关闭后增量照常执行，同模型重开补齐向量，模型或维度变化拒绝混写。"""
    client, _proxy, store, _prefix = isolated_es
    knowledge = StubKnowledgeClient()
    pipeline, _files = _pipeline(store, knowledge, embeddings=True)
    unchanged = _document("c1", "保持原文")
    changed = _document("c1", "待修改正文").model_copy(update={"ref": "note:2", "entity_id": 2})
    knowledge.export_docs["note"] = [unchanged, changed]
    assert await pipeline.run_rebuild() == 2
    active = await store.get_active_meta()
    chunk_index = active["chunk_index"]
    original = {hit["_source"]["item_key"]: hit for hit in await _readable_hits(client, chunk_index)}
    assert all(len(hit["_source"]["embedding"]) == 2 for hit in original.values())
    calls_before_disable = len(pipeline._model_adapter.embed_calls)

    pipeline._model_providers.current = _snapshot(dims=2, enabled=False)
    changed = changed.model_copy(update={"content_version": "c2", "body": "关闭向量后的更新正文"})
    knowledge.export_docs["note"] = [unchanged, changed]
    knowledge.batch_docs["note:2"] = changed
    knowledge.changes_pages = [KnowledgeChangePage(
        changes=[KnowledgeChangeEvent(id=1, entity_type="note", entity_id=2, operation="UPDATE")],
        next_cursor=1, latest_cursor=1,
    )]

    assert await pipeline.run_incremental() == 1

    disabled_rows = {hit["_source"]["item_key"]: hit for hit in await _readable_hits(client, chunk_index)}
    assert disabled_rows["note:1"]["_id"] == original["note:1"]["_id"]
    assert disabled_rows["note:1"]["_source"]["embedding"] == original["note:1"]["_source"]["embedding"]
    assert "embedding" not in disabled_rows["note:2"]["_source"]
    assert len(pipeline._model_adapter.embed_calls) == calls_before_disable
    assert (await store.get_active_meta())["embedding_model"] == active["embedding_model"]
    assert (await store.get_active_meta())["embedding_dims"] == 2
    assert (await pipeline.run_reconcile())["skipped"] == 2

    pipeline._model_providers.current = _snapshot(dims=2)
    repaired = await pipeline.run_reconcile()
    assert repaired["indexed"] == 1
    assert repaired["skipped"] == 1
    restored_rows = {hit["_source"]["item_key"]: hit for hit in await _readable_hits(client, chunk_index)}
    assert restored_rows["note:1"]["_id"] == original["note:1"]["_id"]
    assert all(len(hit["_source"]["embedding"]) == 2 for hit in restored_rows.values())
    calls_after_repair = len(pipeline._model_adapter.embed_calls)
    second = await pipeline.run_reconcile()
    assert second == {"indexed": 0, "meta_updated": 0, "skipped": 2, "deleted": 0, "unextractable": 0, "failed": 0}
    assert len(pipeline._model_adapter.embed_calls) == calls_after_repair

    for snapshot in (_snapshot(model="changed-model", dims=None), _snapshot(dims=3)):
        pipeline._model_providers.current = snapshot
        with pytest.raises(IndexVersionConflictError):
            await pipeline.run_incremental()
        assert await store.get_cursor() == 1
        assert len(pipeline._model_adapter.embed_calls) == calls_after_repair
        assert (await store.get_active_meta())["embedding_model"] == active["embedding_model"]
        assert (await store.get_active_meta())["embedding_dims"] == 2

    pipeline._model_providers.current = _snapshot(dims=2, enabled=False)
    assert await pipeline.run_rebuild() == 2
    rebuilt = await store.get_active_meta()
    assert rebuilt["embedding_model"] is None
    assert rebuilt["embedding_dims"] is None
    rows = await _readable_hits(client, rebuilt["chunk_index"])
    assert len(rows) == 2
    assert all("embedding" not in hit["_source"] for hit in rows)
    mappings = await client.indices.get_mapping(index=rebuilt["chunk_index"])
    assert "embedding" not in mappings[rebuilt["chunk_index"]]["mappings"]["properties"]


async def test_cold_text_index_can_enable_vectors_without_losing_content(isolated_es):
    """冷启动纯文本索引启用向量时补充 mapping 和向量，二次对账零修复。"""
    client, _proxy, store, _prefix = isolated_es
    knowledge = StubKnowledgeClient()
    pipeline, _files = _pipeline(store, knowledge)
    knowledge.export_docs["note"] = [_document("c1", "冷启动文本正文")]
    assert await pipeline.run_rebuild() == 1
    before = await store.get_active_meta()
    chunk_index = before["chunk_index"]
    assert before["embedding_model"] is None
    assert before["embedding_dims"] is None
    assert "embedding" not in (await _readable_hits(client, chunk_index))[0]["_source"]

    pipeline._model_providers.current = _snapshot(dims=2)
    result = await pipeline.run_reconcile()

    assert result["indexed"] == 1
    active = await store.get_active_meta()
    assert active["item_index"] == before["item_index"]
    assert active["chunk_index"] == chunk_index
    assert active["embedding_model"] == "text-embedding-3-small"
    assert active["embedding_dims"] == 2
    rows = await _readable_hits(client, chunk_index)
    assert len(rows) == 1
    assert rows[0]["_source"]["content"] == "冷启动文本正文"
    assert len(rows[0]["_source"]["embedding"]) == 2
    mappings = await client.indices.get_mapping(index=chunk_index)
    assert mappings[chunk_index]["mappings"]["properties"]["embedding"]["dims"] == 2
    second = await pipeline.run_reconcile()
    assert second == {"indexed": 0, "meta_updated": 0, "skipped": 1, "deleted": 0, "unextractable": 0, "failed": 0}


async def test_empty_vector_index_rejects_model_change_until_rebuild(isolated_es):
    """已有模型配置的零向量索引换模型时拒写，保留原配置供同模型重开。

    @author 称霸幼儿园
    """
    client, _proxy, store, _prefix = isolated_es
    item_index, chunk_index = await store.ensure_active_indices("original-model", 2)
    before = await store.get_active_meta()
    assert (await client.count(index=chunk_index))["count"] == 0

    with pytest.raises(IndexVersionConflictError):
        await store.ensure_active_indices("changed-model", 2)

    assert await store.get_active_meta() == before
    assert await store.ensure_active_indices(None, None) == (item_index, chunk_index)
    assert await store.ensure_active_indices("original-model", 2) == (item_index, chunk_index)
    assert await store.get_active_meta() == before


@pytest.mark.parametrize("had_active", [False, True])
@pytest.mark.parametrize("fault", ["alias_before", "alias_after", "meta_before", "meta_after"])
async def test_alias_commit_failures_restore_complete_snapshot(isolated_es, had_active, fault):
    """别名或元数据提交响应失败时恢复完整旧快照，再安全清理未激活索引。"""
    client, proxy, store, _prefix = isolated_es
    if had_active:
        await store.ensure_active_indices(None, None)
    old_active = await store.get_active_meta()
    old_item = old_active["item_index"] if old_active else None
    old_chunk = old_active["chunk_index"] if old_active else None
    item_index, chunk_index = await store.create_versioned_indices(2, None, attempt_id=uuid4().hex)
    proxy.fault = fault

    with pytest.raises(RuntimeError, match=f"injected_{fault}"):
        await store.swap_aliases(2, None, None, item_idx=item_index, chunk_idx=chunk_index)

    assert await store.get_active_meta() == old_active
    for alias, previous in ((es_module.ITEM_ALIAS, old_item), (es_module.CHUNK_ALIAS, old_chunk)):
        if previous:
            assert set(await client.indices.get_alias(name=alias)) == {previous}
        else:
            assert not await client.indices.exists_alias(name=alias)
    await store.delete_versioned_indices(item_index, chunk_index)
    assert not await client.indices.exists(index=item_index)
    assert not await client.indices.exists(index=chunk_index)
    if had_active:
        assert await client.indices.exists(index=old_item)
        assert await client.indices.exists(index=old_chunk)


@pytest.mark.parametrize("fault", ["alias_after_restore_fails", "meta_after_restore_fails"])
async def test_uncertain_alias_recovery_never_deletes_referenced_indices(isolated_es, fault):
    """切换恢复失败时保留仍被别名或激活元数据引用的索引。"""
    client, proxy, store, _prefix = isolated_es
    await store.ensure_active_indices(None, None)
    item_index, chunk_index = await store.create_versioned_indices(2, None, attempt_id=uuid4().hex)
    proxy.fault = fault

    with pytest.raises(RuntimeError, match=f"injected_{fault}"):
        await store.swap_aliases(2, None, None, item_idx=item_index, chunk_idx=chunk_index)

    await store.delete_versioned_indices(item_index, chunk_index)

    assert await client.indices.exists(index=item_index)
    assert await client.indices.exists(index=chunk_index)
    if fault.startswith("alias"):
        assert set(await client.indices.get_alias(name=es_module.ITEM_ALIAS)) == {item_index}
        assert set(await client.indices.get_alias(name=es_module.CHUNK_ALIAS)) == {chunk_index}
    else:
        active = await store.get_active_meta()
        assert active["item_index"] == item_index
        assert active["chunk_index"] == chunk_index
    with pytest.raises(IndexVersionConflictError):
        await store.ensure_active_indices(None, None)


async def test_real_ocr_reconcile_publishes_schema4_page_and_extraction_metadata(isolated_es):
    """真实 ES 与 RapidOCR 对账发布带页码、转写权威性和提取版本的 schema 4 片段。"""
    client, _proxy, store, _prefix = isolated_es
    knowledge = StubKnowledgeClient()
    pipeline, files = _pipeline(store, knowledge)
    current = pipeline._runtime_store.get()
    pipeline._runtime_store.update(current.model_copy(update={
        "indexer": current.indexer.model_copy(update={"ocr_enabled": True}),
    }))
    document = _document("ocr-v1", "unused").model_copy(update={
        "ref": "doc:77", "entity_type": "doc", "format": "pdf", "object_name": "ocr.pdf",
    })
    knowledge.export_docs["doc"] = [document]
    files.blobs["ocr.pdf"] = make_pdf_sample([{"imageText": "Hello Anynote"}])

    result = await pipeline.run_reconcile()

    assert result["indexed"] == 1
    active = await store.get_active_meta()
    assert active["schema_version"] == 4
    assert active["pdf_extractor_version"] == PDF_EXTRACTOR_VERSION
    item = await client.get(index=active["item_index"], id="doc:77")
    assert item["_source"]["content_mode"] == "mixed"
    assert item["_source"]["page_count"] == 1
    assert item["_source"]["extractor_version"] == PDF_EXTRACTOR_VERSION
    hits = await _readable_hits(client, active["chunk_index"])
    assert len(hits) == 1
    source = hits[0]["_source"]
    assert "Hello" in source["content"] and "Anynote" in source["content"]
    assert source["page_no"] == 1
    assert source["extraction_mode"] == "ocr"
    assert source["authority"] == "transcript"
    assert source["source_region_id"] is None
