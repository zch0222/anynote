"""Elasticsearch 知识索引存储、别名原子切换与元数据版本控制。

@author 称霸幼儿园
"""

from datetime import UTC, datetime
from typing import Any

from elasticsearch import ApiError, AsyncElasticsearch

from core.config import IndexerRuntimeSettings, Settings
from indexing.models import (
    DOC_STATUS_INDEXED,
    ChunkPayload,
    IndexVersionConflictError,
    SourceDocument,
)
from indexing.outline import replace_summary_title

ITEM_ALIAS = "kn_item"
CHUNK_ALIAS = "kn_chunk"
META_INDEX = "kn_meta"
META_ACTIVE_DOC_ID = "active"
META_CURSOR_DOC_ID = "cursor"
INDEX_SCHEMA_VERSION = 2


def _format_datetime(value: datetime | int | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC).isoformat()
        return value.isoformat()
    if isinstance(value, int):
        return datetime.fromtimestamp(value / 1000.0, tz=UTC).isoformat()
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed.isoformat()
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                parsed = datetime.strptime(text, fmt).replace(tzinfo=UTC)
                return parsed.isoformat()
            except ValueError:
                continue
    return None


def item_index_name(version: int) -> str:
    """生成版本化知识条目物理索引名。

    :param version: 索引版本号
    :return: 物理索引名称
    """
    return f"{ITEM_ALIAS}_v{version}"


def chunk_index_name(version: int) -> str:
    """生成版本化知识分块物理索引名。

    :param version: 索引版本号
    :return: 物理索引名称
    """
    return f"{CHUNK_ALIAS}_v{version}"


def _build_item_mappings() -> dict[str, Any]:
    return {
        "properties": {
            "item_key": {"type": "keyword"},
            "ref": {"type": "keyword"},
            "entity_type": {"type": "keyword"},
            "subtype": {"type": "keyword"},
            "entity_id": {"type": "long"},
            "kb_id": {"type": "long"},
            "parent_ref": {"type": "keyword"},
            "title": {
                "type": "text",
                "analyzer": "cjk",
                "fields": {"keyword": {"type": "keyword", "ignore_above": 256}},
            },
            "format": {"type": "keyword"},
            "outline": {"type": "text", "analyzer": "cjk"},
            "summary": {"type": "text", "analyzer": "cjk"},
            "authority": {"type": "keyword"},
            "content_version": {"type": "keyword"},
            "meta_version": {"type": "keyword"},
            "index_status": {"type": "integer"},
            "create_by": {"type": "long"},
            "permissions": {"type": "keyword"},
            "data_scope": {"type": "integer"},
            "task_member_ids": {"type": "long"},
            "attributes": {"type": "object", "enabled": False},
            "source_created_at": {"type": "date"},
            "source_updated_at": {"type": "date"},
            "indexed_at": {"type": "date"},
        }
    }


def _build_chunk_mappings(embedding_dims: int | None) -> dict[str, Any]:
    properties: dict[str, Any] = {
        "chunk_id": {"type": "keyword"},
        "item_key": {"type": "keyword"},
        "ref": {"type": "keyword"},
        "entity_type": {"type": "keyword"},
        "subtype": {"type": "keyword"},
        "entity_id": {"type": "long"},
        "kb_id": {"type": "long"},
        "chunk_index": {"type": "integer"},
        "title": {"type": "text", "analyzer": "cjk"},
        "content": {"type": "text", "analyzer": "cjk"},
        "section_path": {"type": "text", "analyzer": "cjk"},
        "page_no": {"type": "integer"},
        "start_ms": {"type": "integer"},
        "end_ms": {"type": "integer"},
        "authority": {"type": "keyword"},
        "content_version": {"type": "keyword"},
        "meta_version": {"type": "keyword"},
        "create_by": {"type": "long"},
        "permissions": {"type": "keyword"},
        "data_scope": {"type": "integer"},
        "task_member_ids": {"type": "long"},
        "source_updated_at": {"type": "date"},
        "indexed_at": {"type": "date"},
    }
    if embedding_dims is not None:
        properties["embedding"] = {
            "type": "dense_vector",
            "dims": embedding_dims,
            "index": True,
            "similarity": "cosine",
        }
    return {"properties": properties}


def build_es_client(settings: Settings, runtime: IndexerRuntimeSettings) -> AsyncElasticsearch:
    """根据进程配置构造 AsyncElasticsearch 客户端。

    :param settings: 进程配置
    :param runtime: 索引运行配置
    :return: ES 异步客户端实例
    """
    kwargs: dict[str, Any] = {
        "hosts": [settings.ES_URL],
        "request_timeout": runtime.es_request_timeout_s,
    }
    if settings.ES_USERNAME and settings.ES_PASSWORD:
        kwargs["basic_auth"] = (settings.ES_USERNAME, settings.ES_PASSWORD)
    return AsyncElasticsearch(**kwargs)


class ElasticsearchKnowledgeStore:
    """管理 Elasticsearch 知识条目、分块与版本化别名。

    @author 称霸幼儿园
    """

    def __init__(self, client: AsyncElasticsearch, replicas: int = 0):
        self._client = client
        self._replicas = replicas

    async def close(self) -> None:
        """关闭底层 Elasticsearch 连接。"""
        await self._client.close()

    async def ensure_meta_index(self) -> None:
        """确保元数据索引 kn_meta 存在。"""
        if await self._client.indices.exists(index=META_INDEX):
            return
        await self._client.indices.create(
            index=META_INDEX,
            settings={"number_of_shards": 1, "number_of_replicas": self._replicas},
            mappings={
                "properties": {
                    "version": {"type": "integer"},
                    "schema_version": {"type": "integer"},
                    "item_index": {"type": "keyword"},
                    "chunk_index": {"type": "keyword"},
                    "embedding_model": {"type": "keyword"},
                    "embedding_dims": {"type": "integer"},
                    "cursor": {"type": "long"},
                    "updated_at": {"type": "date"},
                }
            },
        )

    async def get_active_meta(self) -> dict[str, Any] | None:
        """读取当前激活索引版本与 Embedding 元数据。

        :return: 元数据字典或 None
        """
        await self.ensure_meta_index()
        try:
            response = await self._client.get(index=META_INDEX, id=META_ACTIVE_DOC_ID)
        except ApiError as error:
            if error.status_code == 404:
                return None
            raise
        if not response or not response.get("found"):
            return None
        return dict(response.get("_source") or {})

    async def get_cursor(self) -> int:
        """读取持久化的增量变更游标。

        :return: 上一次成功消费的变更 id，默认 0
        """
        await self.ensure_meta_index()
        try:
            response = await self._client.get(index=META_INDEX, id=META_CURSOR_DOC_ID)
        except ApiError as error:
            if error.status_code == 404:
                return 0
            raise
        if not response or not response.get("found"):
            return 0
        return int((response.get("_source") or {}).get("cursor") or 0)

    async def save_cursor(self, cursor: int) -> None:
        """持久化最新增量消费游标。

        :param cursor: 已成功处理的最大变更 id
        """
        await self.ensure_meta_index()
        await self._client.index(
            index=META_INDEX,
            id=META_CURSOR_DOC_ID,
            document={
                "cursor": cursor,
                "updated_at": datetime.now(UTC).isoformat(),
            },
            refresh="wait_for",
        )

    async def create_versioned_indices(self, version: int, embedding_dims: int | None) -> tuple[str, str]:
        """创建指定版本的 item/chunk 物理索引。

        :param version: 索引版本号
        :param embedding_dims: 向量维度；为 None 时暂不建向量字段
        :return: （item 物理索引名, chunk 物理索引名）
        """
        item_idx = item_index_name(version)
        chunk_idx = chunk_index_name(version)
        settings = {"number_of_shards": 1, "number_of_replicas": self._replicas}
        if not await self._client.indices.exists(index=item_idx):
            await self._client.indices.create(
                index=item_idx,
                settings=settings,
                mappings=_build_item_mappings(),
            )
        if not await self._client.indices.exists(index=chunk_idx):
            await self._client.indices.create(
                index=chunk_idx,
                settings=settings,
                mappings=_build_chunk_mappings(embedding_dims),
            )
        return item_idx, chunk_idx

    async def ensure_active_indices(
        self,
        embedding_model: str | None,
        embedding_dims: int | None,
    ) -> tuple[str, str]:
        """校验激活索引与当前向量配置的一致性，必要时初始化首版索引或补充空库向量映射。

        :param embedding_model: 当前启用模型；未启用时为 None
        :param embedding_dims: 当前向量维度；未启用或待探测时为 None
        :return: 当前激活的（item 索引名, chunk 索引名）
        """
        active = await self.get_active_meta()
        if active is None:
            item_idx, chunk_idx = await self.create_versioned_indices(1, embedding_dims)
            await self.swap_aliases(1, embedding_model, embedding_dims)
            return item_idx, chunk_idx

        if int(active.get("schema_version") or 1) != INDEX_SCHEMA_VERSION:
            raise IndexVersionConflictError()
        active_model = active.get("embedding_model")
        active_dims = active.get("embedding_dims")
        item_idx = active["item_index"]
        chunk_idx = active["chunk_index"]

        if embedding_model is None:
            if active_model is None:
                return item_idx, chunk_idx
            count_res = await self._client.count(
                index=chunk_idx,
                query={"exists": {"field": "embedding"}},
            )
            if int(count_res["count"]) > 0:
                raise IndexVersionConflictError()
            await self._save_active_meta(int(active["version"]), None, active_dims)
            return item_idx, chunk_idx

        if active_model == embedding_model and (embedding_dims is None or active_dims == embedding_dims):
            return item_idx, chunk_idx

        if embedding_dims is None:
            return item_idx, chunk_idx

        count_res = await self._client.count(
            index=chunk_idx,
            query={"exists": {"field": "embedding"}},
        )
        if int(count_res["count"]) == 0 and (active_dims is None or int(active_dims) == embedding_dims):
            if active_dims is None:
                await self._client.indices.put_mapping(
                    index=chunk_idx,
                    properties={
                        "embedding": {
                            "type": "dense_vector",
                            "dims": embedding_dims,
                            "index": True,
                            "similarity": "cosine",
                        }
                    },
                )
            await self._save_active_meta(int(active["version"]), embedding_model, embedding_dims)
            return item_idx, chunk_idx

        raise IndexVersionConflictError()

    async def swap_aliases(
        self,
        version: int,
        embedding_model: str | None,
        embedding_dims: int | None,
    ) -> None:
        """原子切换 kn_item/kn_chunk 别名至新版本物理索引，并更新元数据与清理旧索引。

        :param version: 目标版本号
        :param embedding_model: 目标向量模型名称
        :param embedding_dims: 目标向量维度
        """
        new_item_idx = item_index_name(version)
        new_chunk_idx = chunk_index_name(version)
        actions: list[dict[str, Any]] = []
        old_indices: list[str] = []

        for alias_name, target_idx in ((ITEM_ALIAS, new_item_idx), (CHUNK_ALIAS, new_chunk_idx)):
            try:
                current = await self._client.indices.get_alias(name=alias_name)
                if current:
                    for idx_name in current.keys():
                        if idx_name != target_idx:
                            actions.append({"remove": {"index": idx_name, "alias": alias_name}})
                            old_indices.append(idx_name)
            except ApiError as error:
                if error.status_code != 404:
                    raise
            actions.append({"add": {"index": target_idx, "alias": alias_name}})

        await self._client.indices.update_aliases(actions=actions)
        await self._save_active_meta(version, embedding_model, embedding_dims)

        for idx_name in old_indices:
            try:
                await self._client.indices.delete(index=idx_name)
            except ApiError as error:
                if error.status_code != 404:
                    raise

    async def _save_active_meta(
        self,
        version: int,
        embedding_model: str | None,
        embedding_dims: int | None,
    ) -> None:
        await self.ensure_meta_index()
        await self._client.index(
            index=META_INDEX,
            id=META_ACTIVE_DOC_ID,
            document={
                "version": version,
                "schema_version": INDEX_SCHEMA_VERSION,
                "item_index": item_index_name(version),
                "chunk_index": chunk_index_name(version),
                "embedding_model": embedding_model,
                "embedding_dims": embedding_dims,
                "updated_at": datetime.now(UTC).isoformat(),
            },
            refresh="wait_for",
        )

    async def get_existing_items(self, item_idx: str, refs: list[str]) -> dict[str, dict[str, Any]]:
        """批量查询已有条目的版本与索引状态快照。

        :param item_idx: 目标 item 物理索引
        :param refs: 待查询实体引用列表
        :return: ref 到版本字段字典的映射
        """
        if not refs:
            return {}
        response = await self._client.mget(
            index=item_idx,
            ids=refs,
            _source=["ref", "content_version", "meta_version", "index_status"],
        )
        result: dict[str, dict[str, Any]] = {}
        for entry in response.get("docs", []):
            if entry.get("found"):
                result[entry["_id"]] = entry.get("_source") or {}
        return result

    async def upsert_item_and_chunks(
        self,
        item_idx: str,
        chunk_idx: str,
        document: SourceDocument,
        chunks: list[ChunkPayload],
        index_status: int = DOC_STATUS_INDEXED,
        delete_existing_chunks: bool = True,
        outline: str = "",
        summary: str = "",
    ) -> None:
        """写入或替换单篇源文档及其全部分块。

        :param item_idx: 目标 item 物理索引
        :param chunk_idx: 目标 chunk 物理索引
        :param document: 源文档模型
        :param chunks: 待写入分块列表
        :param index_status: 条目索引状态
        :param delete_existing_chunks: 写入前是否清理旧分块
        :param outline: 条目大纲文本
        :param summary: 条目确定性摘要
        """
        item_key = document.canonical_key
        if delete_existing_chunks:
            await self._client.delete_by_query(
                index=chunk_idx,
                query={"term": {"item_key": item_key}},
                conflicts="proceed",
                refresh=False,
            )

        now_iso = datetime.now(UTC).isoformat()
        acl = document.acl
        item_doc = {
            "item_key": item_key,
            "ref": document.ref,
            "entity_type": document.entity_type,
            "subtype": document.subtype,
            "entity_id": document.entity_id,
            "kb_id": document.kb_id,
            "parent_ref": document.parent_ref,
            "title": document.title or "",
            "format": document.format,
            "outline": outline,
            "summary": summary,
            "authority": document.authority,
            "content_version": document.content_version or "",
            "meta_version": document.meta_version or "",
            "index_status": index_status,
            "create_by": acl.create_by if acl else None,
            "permissions": acl.permissions if acl else None,
            "data_scope": acl.data_scope if acl else None,
            "task_member_ids": acl.task_member_ids if acl else None,
            "attributes": document.attributes or {},
            "source_created_at": _format_datetime(document.source_created_at),
            "source_updated_at": _format_datetime(document.source_updated_at),
            "indexed_at": now_iso,
        }

        operations: list[dict[str, Any]] = [
            {"index": {"_index": item_idx, "_id": item_key}},
            item_doc,
        ]
        for chunk in chunks:
            chunk_doc: dict[str, Any] = {
                "chunk_id": chunk.chunk_id,
                "item_key": chunk.item_key or item_key,
                "ref": chunk.ref,
                "entity_type": chunk.entity_type,
                "subtype": chunk.subtype,
                "entity_id": chunk.entity_id,
                "kb_id": chunk.kb_id,
                "chunk_index": chunk.chunk_index,
                "title": chunk.title,
                "content": chunk.content,
                "section_path": chunk.section_path,
                "page_no": chunk.page_no,
                "start_ms": chunk.start_ms,
                "end_ms": chunk.end_ms,
                "authority": chunk.authority,
                "content_version": chunk.content_version,
                "meta_version": chunk.meta_version,
                "create_by": chunk.create_by,
                "permissions": chunk.permissions,
                "data_scope": chunk.data_scope,
                "task_member_ids": chunk.task_member_ids,
                "source_updated_at": chunk.source_updated_at,
                "indexed_at": now_iso,
            }
            if chunk.embedding is not None:
                chunk_doc["embedding"] = chunk.embedding
            operations.append({"index": {"_index": chunk_idx, "_id": chunk.chunk_id}})
            operations.append(chunk_doc)

        await self._client.bulk(operations=operations, refresh=False)

    async def update_metadata_only(
        self,
        item_idx: str,
        chunk_idx: str,
        document: SourceDocument,
    ) -> None:
        """在正文未变更时仅原地更新条目和已有分块的元数据（跳过重切与重嵌）。

        :param item_idx: 目标 item 物理索引
        :param chunk_idx: 目标 chunk 物理索引
        :param document: 最新源文档模型
        """
        item_key = document.canonical_key
        now_iso = datetime.now(UTC).isoformat()
        acl = document.acl
        source_updated = _format_datetime(document.source_updated_at)
        current = await self._client.get(index=item_idx, id=item_key, _source=["summary"])
        stored_summary = (current.get("_source") or {}).get("summary") if current else None

        await self._client.update(
            index=item_idx,
            id=item_key,
            doc={
                "kb_id": document.kb_id,
                "parent_ref": document.parent_ref,
                "title": document.title or "",
                "summary": replace_summary_title(stored_summary, document.title),
                "authority": document.authority,
                "meta_version": document.meta_version or "",
                "create_by": acl.create_by if acl else None,
                "permissions": acl.permissions if acl else None,
                "data_scope": acl.data_scope if acl else None,
                "task_member_ids": acl.task_member_ids if acl else None,
                "attributes": document.attributes or {},
                "source_updated_at": source_updated,
                "indexed_at": now_iso,
            },
            refresh=False,
        )

        await self._client.update_by_query(
            index=chunk_idx,
            query={"term": {"item_key": item_key}},
            script={
                "source": (
                    "ctx._source.kb_id = params.kb_id;"
                    "ctx._source.title = params.title;"
                    "ctx._source.authority = params.authority;"
                    "ctx._source.meta_version = params.meta_version;"
                    "ctx._source.create_by = params.create_by;"
                    "ctx._source.permissions = params.permissions;"
                    "ctx._source.data_scope = params.data_scope;"
                    "ctx._source.task_member_ids = params.task_member_ids;"
                    "ctx._source.source_updated_at = params.source_updated_at;"
                    "ctx._source.indexed_at = params.indexed_at;"
                ),
                "lang": "painless",
                "params": {
                    "kb_id": document.kb_id,
                    "title": document.title or "",
                    "authority": document.authority,
                    "meta_version": document.meta_version or "",
                    "create_by": acl.create_by if acl else None,
                    "permissions": acl.permissions if acl else None,
                    "data_scope": acl.data_scope if acl else None,
                    "task_member_ids": acl.task_member_ids if acl else None,
                    "source_updated_at": source_updated,
                    "indexed_at": now_iso,
                },
            },
            conflicts="proceed",
            refresh=False,
        )

    async def delete_refs(self, item_idx: str, chunk_idx: str, refs: list[str]) -> None:
        """从条目与分块索引批量删除已移除或失效的文档。

        :param item_idx: item 物理索引
        :param chunk_idx: chunk 物理索引
        :param refs: 待清理的实体唯一标识列表（如 note:1 或 mooc_item:5#transcript）
        """
        clean_refs = list(dict.fromkeys(ref.strip() for ref in refs if ref and ref.strip()))
        if not clean_refs:
            return
        await self._client.delete_by_query(
            index=item_idx,
            query={
                "bool": {
                    "should": [
                        {"terms": {"item_key": clean_refs}},
                        {"ids": {"values": clean_refs}},
                    ],
                    "minimum_should_match": 1,
                }
            },
            conflicts="proceed",
            refresh=False,
        )
        await self._client.delete_by_query(
            index=chunk_idx,
            query={"terms": {"item_key": clean_refs}},
            conflicts="proceed",
            refresh=False,
        )

    async def delete_by_kb_id(self, item_idx: str, chunk_idx: str, kb_id: int) -> None:
        """按知识库 ID 级联删除库内全部索引文档。

        :param item_idx: item 物理索引
        :param chunk_idx: chunk 物理索引
        :param kb_id: 知识库主键 id
        """
        query = {"term": {"kb_id": kb_id}}
        await self._client.delete_by_query(index=item_idx, query=query, conflicts="proceed", refresh=False)
        await self._client.delete_by_query(index=chunk_idx, query=query, conflicts="proceed", refresh=False)

    async def refresh_indices(self, *indices: str) -> None:
        """显式刷新指定索引使最新写入可见。

        :param indices: 待刷新索引名列表
        """
        targets = [idx for idx in indices if idx]
        if targets:
            await self._client.indices.refresh(index=",".join(targets))

    async def list_item_signatures(self, item_idx: str, kb_id: int | None = None) -> dict[str, tuple[str, str]]:
        """遍历已有条目的引用及内容/元数据版本指纹，用于全量对账。

        :param item_idx: 目标 item 物理索引
        :param kb_id: 可选知识库过滤
        :return: ref -> (content_version, meta_version)
        """
        signatures: dict[str, tuple[str, str]] = {}
        query: dict[str, Any] = {"term": {"kb_id": kb_id}} if kb_id is not None else {"match_all": {}}
        search_after: list[Any] | None = None
        while True:
            kwargs: dict[str, Any] = {
                "index": item_idx,
                "query": query,
                "_source": ["item_key", "ref", "content_version", "meta_version"],
                "size": 500,
                "sort": [{"item_key": "asc"}],
            }
            if search_after is not None:
                kwargs["search_after"] = search_after
            response = await self._client.search(**kwargs)
            hits = response.get("hits", {}).get("hits", [])
            if not hits:
                break
            for hit in hits:
                src = hit.get("_source") or {}
                key = src.get("item_key") or hit.get("_id")
                signatures[str(key)] = (
                    str(src.get("content_version") or ""),
                    str(src.get("meta_version") or ""),
                )
            search_after = hits[-1].get("sort")
            if len(hits) < 500:
                break
        return signatures
