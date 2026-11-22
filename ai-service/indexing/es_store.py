"""Elasticsearch 知识索引存储、别名原子切换与元数据版本控制。

@author 称霸幼儿园
"""

from datetime import UTC, datetime
import logging
from typing import Any
from uuid import uuid4

from elasticsearch import ApiError, AsyncElasticsearch

from core.config import IndexerRuntimeSettings, Settings
from indexing.chunking import CHUNKER_VERSION
from indexing.models import (
    DOC_STATUS_INDEXED,
    ChunkPayload,
    IndexVersionConflictError,
    ParsedDocument,
    SourceDocument,
)
from indexing.outline import replace_summary_title
from indexing.parsers.pdf import PDF_EXTRACTOR_VERSION

ITEM_ALIAS = "kn_item"
CHUNK_ALIAS = "kn_chunk"
META_INDEX = "kn_meta"
META_ACTIVE_DOC_ID = "active"
META_CURSOR_DOC_ID = "cursor"
INDEX_SCHEMA_VERSION = 4
EMBEDDING_PROFILE_VERSION = "title-path-body-v1"
logger = logging.getLogger(__name__)


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


def item_index_name(version: int, attempt_id: str | None = None) -> str:
    """生成版本化知识条目物理索引名。

    :param version: 索引版本号
    :return: 物理索引名称
    """
    suffix = f"_a{attempt_id}" if attempt_id else ""
    return f"{ITEM_ALIAS}_v{version}{suffix}"


def chunk_index_name(version: int, attempt_id: str | None = None) -> str:
    """生成版本化知识分块物理索引名。

    :param version: 索引版本号
    :return: 物理索引名称
    """
    suffix = f"_a{attempt_id}" if attempt_id else ""
    return f"{CHUNK_ALIAS}_v{version}{suffix}"


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
            "readable": {"type": "boolean"},
            "generation": {"type": "keyword"},
            "chunk_count": {"type": "integer"},
            "chunker_version": {"type": "keyword"},
            "page_count": {"type": "integer"},
            "content_mode": {"type": "keyword"},
            "extractor_version": {"type": "keyword"},
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
        "generation": {"type": "keyword"},
        "chunker_version": {"type": "keyword"},
        "readable": {"type": "boolean"},
        "title": {"type": "text", "analyzer": "cjk"},
        "content": {"type": "text", "analyzer": "cjk"},
        "section_path": {"type": "text", "analyzer": "cjk"},
        "page_no": {"type": "integer"},
        "start_ms": {"type": "integer"},
        "end_ms": {"type": "integer"},
        "start_line": {"type": "integer"},
        "end_line": {"type": "integer"},
        "authority": {"type": "keyword"},
        "extraction_mode": {"type": "keyword"},
        "source_region_id": {"type": "keyword"},
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
                    "pdf_extractor_version": {"type": "keyword"},
                    "cursor": {"type": "long"},
                    "latest_cursor": {"type": "long"},
                    "lag_records": {"type": "long"},
                    "last_processed_at": {"type": "date"},
                    "last_success_at": {"type": "date"},
                    "last_error_type": {"type": "keyword"},
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
        await self._client.update(
            index=META_INDEX,
            id=META_CURSOR_DOC_ID,
            doc={
                "cursor": cursor,
                "updated_at": datetime.now(UTC).isoformat(),
            },
            doc_as_upsert=True,
            refresh="wait_for",
        )

    async def get_watermark(self) -> dict[str, Any]:
        """读取最近一轮索引水位与处理状态。"""
        await self.ensure_meta_index()
        try:
            response = await self._client.get(index=META_INDEX, id=META_CURSOR_DOC_ID)
        except ApiError as error:
            if error.status_code == 404:
                return {
                    "cursor": 0,
                    "latest_cursor": 0,
                    "lag_records": 0,
                    "last_processed_at": None,
                    "last_success_at": None,
                    "last_error_type": None,
                }
            raise
        return dict((response or {}).get("_source") or {})

    async def save_watermark(
        self,
        latest_cursor: int,
        processed_cursor: int,
        last_processed_at: str,
        last_success_at: str | None,
        last_error_type: str | None,
    ) -> None:
        """保存 source/processed 水位、处理时间和最近错误类型。"""
        await self.ensure_meta_index()
        await self._client.index(
            index=META_INDEX,
            id=META_CURSOR_DOC_ID,
            document={
                "cursor": processed_cursor,
                "latest_cursor": latest_cursor,
                "lag_records": max(0, latest_cursor - processed_cursor),
                "last_processed_at": last_processed_at,
                "last_success_at": last_success_at,
                "last_error_type": last_error_type,
                "updated_at": datetime.now(UTC).isoformat(),
            },
            refresh="wait_for",
        )

    async def create_versioned_indices(
        self,
        version: int,
        embedding_dims: int | None,
        attempt_id: str | None = None,
    ) -> tuple[str, str]:
        """创建指定版本的 item/chunk 物理索引。

        :param version: 索引版本号
        :param embedding_dims: 向量维度；为 None 时暂不建向量字段
        :return: （item 物理索引名, chunk 物理索引名）
        """
        item_idx = item_index_name(version, attempt_id)
        chunk_idx = chunk_index_name(version, attempt_id)
        settings = {"number_of_shards": 1, "number_of_replicas": self._replicas}
        try:
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
        except Exception:
            if attempt_id:
                await self.delete_versioned_indices(item_idx, chunk_idx)
            raise
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
        if active.get("chunker_version") != CHUNKER_VERSION:
            raise IndexVersionConflictError()
        if active.get("embedding_profile_version") != EMBEDDING_PROFILE_VERSION:
            raise IndexVersionConflictError()
        if active.get("pdf_extractor_version") != PDF_EXTRACTOR_VERSION:
            raise IndexVersionConflictError()
        active_model = active.get("embedding_model")
        active_dims = active.get("embedding_dims")
        item_idx = active["item_index"]
        chunk_idx = active["chunk_index"]
        if (
            await self._alias_targets(ITEM_ALIAS) != [item_idx]
            or await self._alias_targets(CHUNK_ALIAS) != [chunk_idx]
        ):
            raise IndexVersionConflictError()

        if embedding_model is None:
            return item_idx, chunk_idx

        if active_model is not None and active_model != embedding_model:
            raise IndexVersionConflictError()

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
            await self._save_active_meta(int(active["version"]), embedding_model, embedding_dims, item_idx, chunk_idx)
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
        """原子切换 kn_item/kn_chunk 别名至新版本物理索引，并更新元数据与清理旧索引。

        :param version: 目标版本号
        :param embedding_model: 目标向量模型名称
        :param embedding_dims: 目标向量维度
        """
        new_item_idx = item_idx or item_index_name(version)
        new_chunk_idx = chunk_idx or chunk_index_name(version)
        actions: list[dict[str, Any]] = []
        old_indices: list[str] = []
        old_by_alias: dict[str, list[str]] = {ITEM_ALIAS: [], CHUNK_ALIAS: []}
        old_active = await self.get_active_meta()

        for alias_name, target_idx in ((ITEM_ALIAS, new_item_idx), (CHUNK_ALIAS, new_chunk_idx)):
            try:
                current = await self._client.indices.get_alias(name=alias_name)
                if current:
                    for idx_name in current.keys():
                        old_by_alias[alias_name].append(idx_name)
                        if idx_name != target_idx:
                            actions.append({"remove": {"index": idx_name, "alias": alias_name}})
                            old_indices.append(idx_name)
            except ApiError as error:
                if error.status_code != 404:
                    raise
            actions.append({"add": {"index": target_idx, "alias": alias_name}})

        try:
            await self._client.indices.update_aliases(actions=actions)
            await self._save_active_meta(
                version,
                embedding_model,
                embedding_dims,
                new_item_idx,
                new_chunk_idx,
            )
        except Exception:
            try:
                await self._restore_activation_snapshot(old_by_alias, old_active)
            except Exception as error:
                logger.error("索引切换快照恢复失败 type=%s", type(error).__name__)
            raise

        for idx_name in old_indices:
            try:
                await self._client.indices.delete(index=idx_name)
            except Exception as error:
                logger.warning("旧索引清理失败 index=%s type=%s", idx_name, type(error).__name__)

    async def _alias_targets(self, alias: str) -> list[str]:
        """读取指定别名当前引用的全部物理索引。"""
        try:
            response = await self._client.indices.get_alias(name=alias)
        except ApiError as error:
            if error.status_code == 404:
                return []
            raise
        return sorted(response)

    async def _restore_activation_snapshot(
        self,
        aliases: dict[str, list[str]],
        active: dict[str, Any] | None,
    ) -> None:
        """恢复切换前的别名与激活元数据，并读取核对恢复结果。"""
        actions: list[dict[str, Any]] = []
        for alias, old_targets in aliases.items():
            current = set(await self._alias_targets(alias))
            previous = set(old_targets)
            actions.extend(
                {"remove": {"index": index, "alias": alias}}
                for index in sorted(current - previous)
            )
            actions.extend(
                {"add": {"index": index, "alias": alias}}
                for index in sorted(previous - current)
            )
        if actions:
            await self._client.indices.update_aliases(actions=actions)
        current_active = await self.get_active_meta()
        if current_active != active:
            if active is None:
                try:
                    await self._client.delete(index=META_INDEX, id=META_ACTIVE_DOC_ID, refresh=True)
                except ApiError as error:
                    if error.status_code != 404:
                        raise
            else:
                await self._client.index(
                    index=META_INDEX,
                    id=META_ACTIVE_DOC_ID,
                    document=active,
                    refresh=True,
                )
        for alias, previous in aliases.items():
            if await self._alias_targets(alias) != sorted(previous):
                raise IndexVersionConflictError()
        if await self.get_active_meta() != active:
            raise IndexVersionConflictError()

    async def _save_active_meta(
        self,
        version: int,
        embedding_model: str | None,
        embedding_dims: int | None,
        item_idx: str | None = None,
        chunk_idx: str | None = None,
    ) -> None:
        await self.ensure_meta_index()
        await self._client.index(
            index=META_INDEX,
            id=META_ACTIVE_DOC_ID,
            document={
                "version": version,
                "schema_version": INDEX_SCHEMA_VERSION,
                "chunker_version": CHUNKER_VERSION,
                "embedding_profile_version": EMBEDDING_PROFILE_VERSION,
                "pdf_extractor_version": PDF_EXTRACTOR_VERSION,
                "item_index": item_idx or item_index_name(version),
                "chunk_index": chunk_idx or chunk_index_name(version),
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
            _source=[
                "ref",
                "entity_type",
                "format",
                "extractor_version",
                "content_version",
                "meta_version",
                "index_status",
                "title",
                "generation",
                "chunk_count",
                "chunker_version",
                "readable",
                "create_by",
                "permissions",
                "data_scope",
                "task_member_ids",
            ],
        )
        result: dict[str, dict[str, Any]] = {}
        for entry in response.get("docs", []):
            if entry.get("found"):
                result[entry["_id"]] = entry.get("_source") or {}
        return result

    async def get_chunk_signatures(
        self,
        chunk_idx: str,
        item_keys: list[str] | None = None,
        kb_id: int | None = None,
    ) -> dict[str, dict[str, Any]]:
        """汇总片段代际、数量、版本和可读状态。"""
        query: dict[str, Any] = (
            {"terms": {"item_key": list(dict.fromkeys(item_keys))}}
            if item_keys is not None
            else {"match_all": {}}
        )
        if kb_id is not None:
            query = {"bool": {"filter": [query, {"term": {"kb_id": kb_id}}]}}
        signatures: dict[str, dict[str, Any]] = {}
        search_after: list[Any] | None = None
        while True:
            kwargs: dict[str, Any] = {
                "index": chunk_idx,
                "query": query,
                "_source": ["item_key", "generation", "chunker_version", "content_version", "meta_version", "readable"],
                "size": 500,
                "sort": [{"chunk_id": "asc"}],
            }
            if search_after is not None:
                kwargs["search_after"] = search_after
            response = await self._client.search(**kwargs)
            hits = response.get("hits", {}).get("hits", [])
            if not hits:
                break
            for hit in hits:
                source = hit.get("_source") or {}
                key = str(source.get("item_key") or "")
                generation = str(source.get("generation") or "")
                entry = signatures.setdefault(
                    key,
                    {"counts": {}, "chunker_versions": {}, "content_versions": {}, "meta_versions": {}, "readable": {}},
                )
                entry["counts"][generation] = entry["counts"].get(generation, 0) + 1
                entry["readable"][generation] = entry["readable"].get(generation, True) and source.get("readable") is True
                entry["chunker_versions"].setdefault(generation, set()).add(source.get("chunker_version"))
                entry["content_versions"].setdefault(generation, set()).add(source.get("content_version"))
                entry["meta_versions"].setdefault(generation, set()).add(source.get("meta_version"))
            search_after = hits[-1].get("sort")
            if len(hits) < 500:
                break
        return signatures

    async def get_vector_counts(self, chunk_idx: str, items: list[tuple[str, str]]) -> dict[tuple[str, str], int]:
        """批量统计指定条目代际中已计算向量的片段数。"""
        if not items:
            return {}
        searches: list[dict[str, Any]] = []
        for item_key, generation in items:
            searches.extend(
                [
                    {"index": chunk_idx},
                    {
                        "size": 0,
                        "track_total_hits": True,
                        "query": {
                            "bool": {
                                "filter": [
                                    {"term": {"item_key": item_key}},
                                    {"term": {"generation": generation}},
                                    {"exists": {"field": "embedding"}},
                                ]
                            }
                        },
                    },
                ]
            )
        response = await self._client.msearch(searches=searches)
        responses = response.get("responses") or []
        if len(responses) != len(items) or any(bucket.get("error") for bucket in responses):
            raise RuntimeError("Elasticsearch 向量覆盖核对失败")
        result: dict[tuple[str, str], int] = {}
        for key, bucket in zip(items, responses, strict=True):
            result[key] = int((bucket.get("hits") or {}).get("total", {}).get("value") or 0)
        return result

    async def is_item_complete(
        self,
        item: dict[str, Any],
        chunk_signature: dict[str, Any] | None,
        embedding_count: int | None,
        require_embeddings: bool,
    ) -> bool:
        """判断条目片段数量、代际、切分版本与向量覆盖是否完整。"""
        generation = str(item.get("generation") or "")
        if (
            item.get("entity_type") == "doc" or item.get("format") == "pdf"
        ) and item.get("extractor_version") != PDF_EXTRACTOR_VERSION:
            return False
        expected_count = item.get("chunk_count")
        if (
            generation
            and item.get("readable") is True
            and item.get("chunker_version") == CHUNKER_VERSION
            and expected_count == 0
            and chunk_signature is None
        ):
            return True
        if (
            not generation
            or item.get("readable") is not True
            or item.get("chunker_version") != CHUNKER_VERSION
            or chunk_signature is None
            or set(chunk_signature["counts"]) != {generation}
        ):
            return False
        expected_count = int(item.get("chunk_count") or 0)
        if chunk_signature["counts"].get(generation, 0) != expected_count:
            return False
        if chunk_signature["readable"].get(generation) is not True:
            return False
        if chunk_signature["chunker_versions"].get(generation) != {CHUNKER_VERSION}:
            return False
        if chunk_signature["content_versions"].get(generation) != {item.get("content_version") or ""}:
            return False
        if chunk_signature["meta_versions"].get(generation) != {item.get("meta_version") or ""}:
            return False
        if require_embeddings and embedding_count != expected_count:
            return False
        return True

    async def delete_versioned_indices(self, item_idx: str, chunk_idx: str) -> None:
        """删除未被别名或激活元数据引用的 rebuild 物理索引。"""
        active = await self.get_active_meta()
        active_indexes = {
            active.get("item_index"), active.get("chunk_index")
        } if active else set()
        for index in (item_idx, chunk_idx):
            if index in active_indexes:
                logger.warning("保留激活元数据引用的索引 index=%s", index)
                continue
            try:
                aliases = await self._client.indices.get_alias(index=index)
            except ApiError as error:
                if error.status_code == 404:
                    continue
                raise
            if any(entry.get("aliases") for entry in aliases.values()):
                logger.warning("保留别名引用的索引 index=%s", index)
                continue
            try:
                await self._client.indices.delete(index=index)
            except ApiError as error:
                if error.status_code != 404:
                    raise

    async def _checked_bulk(self, operations: list[dict[str, Any]], ref: str, action: str) -> None:
        """检查 bulk 的整体标记、每个动作状态与响应数量。"""
        response = await self._client.bulk(operations=operations, refresh=True)
        items = response.get("items") or []
        failures: list[str] = []
        for item in items:
            if not item:
                failures.append("missing_action_result")
                continue
            operation, result = next(iter(item.items()))
            status = int(result.get("status") or 0)
            error = result.get("error")
            if error or status < 200 or status >= 300:
                error_type = error.get("type") if isinstance(error, dict) else type(error).__name__
                failures.append(f"{operation}:{status}:{error_type or 'unknown'}")
        if response.get("errors") or len(items) != len(operations) // 2 or failures:
            summary = ",".join(failures[:5]) or "bulk_errors=true"
            logger.error("Elasticsearch bulk 写入失败 ref=%s action=%s failures=%s", ref, action, summary)
            raise RuntimeError(f"Elasticsearch bulk 写入失败 ref={ref} action={action} failures={summary}")

    @staticmethod
    def _check_query_write(response: dict[str, Any], operation: str) -> None:
        """拒绝 update/delete-by-query 的失败、超时与版本冲突结果。"""
        if response.get("failures") or response.get("timed_out") or response.get("version_conflicts"):
            raise RuntimeError(f"Elasticsearch {operation}失败")

    async def _set_readable_for_item(
        self,
        item_idx: str,
        chunk_idx: str,
        item_key: str,
        readable: bool,
        generation: str | None = None,
    ) -> None:
        """更新条目及其片段的检索可读标记。"""
        filters: list[dict[str, Any]] = [{"term": {"item_key": item_key}}]
        if generation is not None:
            filters.append({"term": {"generation": generation}})
        response = await self._client.update_by_query(
            index=chunk_idx,
            query={"bool": {"filter": filters}},
            script={"source": "ctx._source.readable = params.value", "params": {"value": readable}},
            conflicts="abort",
            refresh=True,
        )
        self._check_query_write(response, "片段可读状态更新")
        try:
            await self._client.update(
                index=item_idx,
                id=item_key,
                doc={"readable": readable},
                refresh=True,
            )
        except ApiError as error:
            if error.status_code != 404:
                raise

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
        parsed: ParsedDocument | None = None,
    ) -> None:
        """写入或替换单篇源文档及其全部分块。

        :param item_idx: 目标 item 物理索引
        :param chunk_idx: 目标 chunk 物理索引
        :param document: 源文档模型
        :param chunks: 待写入分块列表
        :param index_status: 条目索引状态
        :param delete_existing_chunks: 新代际发布成功后是否清理旧分块
        :param outline: 条目大纲文本
        :param summary: 条目确定性摘要
        :param parsed: PDF 页数、内容形态与提取规则版本
        """
        item_key = document.canonical_key
        generation = uuid4().hex
        now_iso = datetime.now(UTC).isoformat()
        acl = document.acl
        try:
            current = await self._client.get(index=item_idx, id=item_key)
            old_source = dict(current.get("_source") or {})
        except ApiError as error:
            if error.status_code != 404:
                raise
            old_source = None

        acl_changed = old_source is not None and any(
            old_source.get(field) != value
            for field, value in (
                ("kb_id", document.kb_id),
                ("create_by", acl.create_by if acl else None),
                ("permissions", acl.permissions if acl else None),
                ("data_scope", acl.data_scope if acl else None),
                ("task_member_ids", acl.task_member_ids if acl else None),
            )
        )
        if acl_changed:
            await self._set_readable_for_item(item_idx, chunk_idx, item_key, False)
            old_source["readable"] = False

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
            "readable": False,
            "generation": generation,
            "chunk_count": len(chunks),
            "chunker_version": CHUNKER_VERSION,
            "page_count": parsed.page_count if parsed else None,
            "content_mode": parsed.content_mode if parsed else "text",
            "extractor_version": parsed.extractor_version if parsed else "",
            "create_by": acl.create_by if acl else None,
            "permissions": acl.permissions if acl else None,
            "data_scope": acl.data_scope if acl else None,
            "task_member_ids": acl.task_member_ids if acl else None,
            "attributes": document.attributes or {},
            "source_created_at": _format_datetime(document.source_created_at),
            "source_updated_at": _format_datetime(document.source_updated_at),
            "indexed_at": now_iso,
        }

        chunk_operations: list[dict[str, Any]] = []
        for chunk in chunks:
            chunk_id = f"{item_key}#{generation}#{chunk.chunk_index}"
            chunk_doc: dict[str, Any] = {
                "chunk_id": chunk_id,
                "item_key": chunk.item_key or item_key,
                "ref": chunk.ref,
                "entity_type": chunk.entity_type,
                "subtype": chunk.subtype,
                "entity_id": chunk.entity_id,
                "kb_id": chunk.kb_id,
                "chunk_index": chunk.chunk_index,
                "generation": generation,
                "chunker_version": CHUNKER_VERSION,
                "readable": False,
                "title": chunk.title,
                "content": chunk.content,
                "section_path": chunk.section_path,
                "page_no": chunk.page_no,
                "start_ms": chunk.start_ms,
                "end_ms": chunk.end_ms,
                "start_line": chunk.start_line,
                "end_line": chunk.end_line,
                "authority": chunk.authority,
                "extraction_mode": chunk.extraction_mode,
                "source_region_id": chunk.source_region_id,
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
            chunk_operations.extend(
                [{"index": {"_index": chunk_idx, "_id": chunk_id}}, chunk_doc]
            )

        item_written = False
        published = False
        try:
            if chunk_operations:
                await self._checked_bulk(chunk_operations, item_key, "chunks")
                count = await self._client.count(
                    index=chunk_idx,
                    query={"bool": {"filter": [{"term": {"item_key": item_key}}, {"term": {"generation": generation}}]}},
                )
                if int(count.get("count") or 0) != len(chunks):
                    raise RuntimeError(f"Elasticsearch 片段数量核对失败 ref={item_key}")

            item_written = True
            await self._checked_bulk(
                [{"index": {"_index": item_idx, "_id": item_key}}, item_doc],
                item_key,
                "item",
            )
            if chunks:
                await self._set_readable_for_item(item_idx, chunk_idx, item_key, True, generation)
            await self._client.update(
                index=item_idx,
                id=item_key,
                doc={"readable": True},
                refresh=True,
            )
            published = True
            if delete_existing_chunks:
                cleanup_result = await self._client.delete_by_query(
                    index=chunk_idx,
                    query={
                        "bool": {
                            "filter": [{"term": {"item_key": item_key}}],
                            "must_not": [{"term": {"generation": generation}}],
                        }
                    },
                    conflicts="abort",
                    refresh=True,
                )
                self._check_query_write(cleanup_result, "旧代际片段删除")
        except Exception:
            if published:
                raise
            try:
                cleanup_result = await self._client.delete_by_query(
                    index=chunk_idx,
                    query={
                        "bool": {
                            "filter": [
                                {"term": {"item_key": item_key}},
                                {"term": {"generation": generation}},
                            ]
                        }
                    },
                    conflicts="abort",
                    refresh=True,
                )
                self._check_query_write(cleanup_result, "失败代际片段删除")
            except Exception as cleanup_error:
                logger.error(
                    "Elasticsearch 失败代际清理失败 ref=%s generation=%s type=%s",
                    item_key,
                    generation,
                    type(cleanup_error).__name__,
                )
            if item_written:
                try:
                    if old_source is None:
                        await self._client.delete(index=item_idx, id=item_key, refresh="wait_for")
                    else:
                        await self._client.index(
                            index=item_idx,
                            id=item_key,
                            document=old_source,
                            refresh="wait_for",
                        )
                except Exception as restore_error:
                    logger.error(
                        "Elasticsearch 条目回滚失败 ref=%s type=%s",
                        item_key,
                        type(restore_error).__name__,
                    )
            raise

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
        await self._set_readable_for_item(item_idx, chunk_idx, item_key, False)
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

        response = await self._client.update_by_query(
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
            conflicts="abort",
            refresh=True,
        )
        self._check_query_write(response, "权限元数据更新")
        await self._set_readable_for_item(item_idx, chunk_idx, item_key, True)

    async def delete_refs(self, item_idx: str, chunk_idx: str, refs: list[str]) -> None:
        """从条目与分块索引批量删除已移除或失效的文档。

        :param item_idx: item 物理索引
        :param chunk_idx: chunk 物理索引
        :param refs: 待清理的实体唯一标识列表（如 note:1 或 mooc_item:5#transcript）
        """
        clean_refs = list(dict.fromkeys(ref.strip() for ref in refs if ref and ref.strip()))
        if not clean_refs:
            return
        for ref in clean_refs:
            await self._set_readable_for_item(item_idx, chunk_idx, ref, False)
        chunk_delete = await self._client.delete_by_query(
            index=chunk_idx,
            query={"terms": {"item_key": clean_refs}},
            conflicts="abort",
            refresh=True,
        )
        self._check_query_write(chunk_delete, "片段删除")
        item_delete = await self._client.delete_by_query(
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
            conflicts="abort",
            refresh=True,
        )
        self._check_query_write(item_delete, "条目删除")

    async def delete_by_kb_id(self, item_idx: str, chunk_idx: str, kb_id: int) -> None:
        """按知识库 ID 级联删除库内全部索引文档。

        :param item_idx: item 物理索引
        :param chunk_idx: chunk 物理索引
        :param kb_id: 知识库主键 id
        """
        query = {"term": {"kb_id": kb_id}}
        for index in (chunk_idx, item_idx):
            response = await self._client.update_by_query(
                index=index,
                query=query,
                script={"source": "ctx._source.readable = false"},
                conflicts="abort",
                refresh=True,
            )
            self._check_query_write(response, "知识库不可读标记")
        for index in (chunk_idx, item_idx):
            response = await self._client.delete_by_query(
                index=index,
                query=query,
                conflicts="abort",
                refresh=True,
            )
            self._check_query_write(response, "知识库删除")

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
