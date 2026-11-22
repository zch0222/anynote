"""只读访问 `kn_item` / `kn_chunk` / `kn_meta` 的查询封装。

@author 称霸幼儿园
"""

from typing import Any

from elasticsearch import ApiError, AsyncElasticsearch

from indexing.es_store import CHUNK_ALIAS, ITEM_ALIAS, META_ACTIVE_DOC_ID, META_INDEX
from retrieval.models import ChunkHit

CHUNK_SOURCE = [
    "item_key", "ref", "entity_type", "subtype", "kb_id", "title", "chunk_index", "content",
    "section_path", "page_no", "start_ms", "end_ms", "authority", "content_version",
    "start_line", "end_line", "extraction_mode", "source_region_id",
]
ITEM_SOURCE = ["item_key", "ref", "entity_type", "subtype", "kb_id", "title", "authority",
               "content_version", "parent_ref", "summary", "content_mode", "page_count"]
SCAN_PAGE_SIZE = 500
MAX_SCAN_CHUNKS = 10000


def _hit(source: dict[str, Any], highlight: dict[str, Any] | None = None) -> ChunkHit:
    fragments = (highlight or {}).get("content") or []
    return ChunkHit(
        item_key=str(source.get("item_key") or source.get("ref") or ""),
        ref=str(source.get("ref") or ""),
        entity_type=str(source.get("entity_type") or ""),
        subtype=source.get("subtype"),
        kb_id=source.get("kb_id"),
        title=str(source.get("title") or ""),
        chunk_index=source.get("chunk_index"),
        content=str(source.get("content") or ""),
        section_path=source.get("section_path"),
        page_no=source.get("page_no"),
        start_ms=source.get("start_ms"),
        end_ms=source.get("end_ms"),
        start_line=source.get("start_line"),
        end_line=source.get("end_line"),
        authority=str(source.get("authority") or "original"),
        content_version=str(source.get("content_version") or ""),
        content_mode=source.get("content_mode"),
        page_count=source.get("page_count"),
        extraction_mode=str(source.get("extraction_mode") or "text"),
        source_region_id=source.get("source_region_id"),
        highlight=fragments[0] if fragments else None,
    )


def _readable_filters(filters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """补充索引记录可读状态过滤条件。

    :param filters: 调用方的过滤条件
    :return: 含可读状态的过滤条件
    @author 称霸幼儿园
    """
    return [{"term": {"readable": True}}, *filters]


class KnowledgeIndexReader:
    """检索层使用的只读索引查询。

    @author 称霸幼儿园
    """

    def __init__(self, client: AsyncElasticsearch):
        self._client = client

    async def active_embedding(self) -> tuple[str | None, int | None]:
        """读取激活索引的嵌入模型与维度。

        :return: （模型名, 维度），未启用向量时均为 None
        """
        try:
            response = await self._client.get(index=META_INDEX, id=META_ACTIVE_DOC_ID)
        except ApiError as error:
            if error.status_code == 404:
                return None, None
            raise
        source = (response or {}).get("_source") or {}
        return source.get("embedding_model"), source.get("embedding_dims")

    async def lexical(
        self,
        query: str,
        phrases: list[str],
        filters: list[dict[str, Any]],
        size: int,
    ) -> list[ChunkHit]:
        """片段级全文召回：标题与标题路径权重高于正文，引号原话按短语必须命中。

        :param query: 查询文本
        :param phrases: 必须命中的短语
        :param filters: 预过滤条件
        :param size: 候选数
        :return: 有序命中
        """
        must: list[dict[str, Any]] = [
            {
                "multi_match": {
                    "query": query,
                    "fields": ["title^3", "section_path^2", "content"],
                    "type": "best_fields",
                }
            }
        ]
        must.extend({"match_phrase": {"content": phrase}} for phrase in phrases)
        response = await self._client.search(
            index=CHUNK_ALIAS,
            query={"bool": {"must": must, "filter": _readable_filters(filters)}},
            size=size,
            _source=CHUNK_SOURCE,
            highlight={
                "fields": {"content": {"fragment_size": 150, "number_of_fragments": 1}},
                "pre_tags": [""],
                "post_tags": [""],
            },
        )
        return [_hit(item.get("_source") or {}, item.get("highlight")) for item in response["hits"]["hits"]]

    async def semantic(self, vector: list[float], filters: list[dict[str, Any]], size: int) -> list[ChunkHit]:
        """片段级向量近邻召回，过滤条件在近邻搜索内生效。

        :param vector: 查询向量
        :param filters: 预过滤条件
        :param size: 候选数
        :return: 有序命中
        """
        response = await self._client.search(
            index=CHUNK_ALIAS,
            knn={
                "field": "embedding",
                "query_vector": vector,
                "k": size,
                "num_candidates": size * 2,
                "filter": {"bool": {"filter": _readable_filters(filters)}},
            },
            size=size,
            _source=CHUNK_SOURCE,
        )
        return [_hit(item.get("_source") or {}) for item in response["hits"]["hits"]]

    async def items(self, query: str, filters: list[dict[str, Any]], size: int) -> list[ChunkHit]:
        """条目级召回：匹配标题、大纲与摘要。

        :param query: 查询文本
        :param filters: 预过滤条件
        :param size: 候选数
        :return: 条目命中（chunk_index 为空，正文为摘要）
        """
        response = await self._client.search(
            index=ITEM_ALIAS,
            query={
                "bool": {
                    "must": [
                        {
                            "multi_match": {
                                "query": query,
                                "fields": ["title^3", "outline^1.5", "summary"],
                                "type": "best_fields",
                            }
                        }
                    ],
                    "filter": _readable_filters(filters),
                }
            },
            size=size,
            _source=ITEM_SOURCE,
        )
        hits = []
        for item in response["hits"]["hits"]:
            source = item.get("_source") or {}
            hit = _hit(source)
            hit.content = str(source.get("summary") or "")
            hits.append(hit)
        return hits

    async def item_details(self, item_keys: list[str]) -> dict[str, ChunkHit]:
        """按条目键读取内容形态和页数，供片段命中补充文档级元数据。

        :param item_keys: 条目键列表
        :return: 条目键到条目元数据命中的映射
        """
        if not item_keys:
            return {}
        response = await self._client.search(
            index=ITEM_ALIAS,
            query={
                "bool": {
                    "filter": _readable_filters([{"terms": {"item_key": list(dict.fromkeys(item_keys))}}]),
                }
            },
            size=len(set(item_keys)),
            _source=ITEM_SOURCE,
        )
        result: dict[str, ChunkHit] = {}
        for item in response["hits"]["hits"]:
            hit = _hit(item.get("_source") or {})
            result[hit.item_key] = hit
        return result

    async def chunks_around(self, positions: list[tuple[str, int]], window: int) -> dict[str, dict[int, ChunkHit]]:
        """批量读取命中片段及其前后 window 个相邻片段。

        :param positions: （条目键, 片段序号）
        :param window: 前后片数
        :return: 条目键到 {片段序号: 片段} 的映射
        """
        if not positions:
            return {}
        should = [
            {
                "bool": {
                    "filter": [
                        {"term": {"item_key": item_key}},
                        {"range": {"chunk_index": {"gte": max(0, index - window), "lte": index + window}}},
                    ]
                }
            }
            for item_key, index in positions
        ]
        response = await self._client.search(
            index=CHUNK_ALIAS,
            query={"bool": {"should": should, "minimum_should_match": 1, "filter": _readable_filters([])}},
            size=len(positions) * (2 * window + 1),
            _source=CHUNK_SOURCE,
        )
        result: dict[str, dict[int, ChunkHit]] = {}
        for item in response["hits"]["hits"]:
            hit = _hit(item.get("_source") or {})
            if hit.chunk_index is not None:
                result.setdefault(hit.item_key, {})[hit.chunk_index] = hit
        return result

    async def item_chunks(
        self,
        item_key: str,
        start_page: int | None = None,
        end_page: int | None = None,
    ) -> list[ChunkHit]:
        """按片段序号读取一个条目的全部片段，可按页码范围过滤。

        :param item_key: 条目键
        :param start_page: 起始页（含）
        :param end_page: 结束页（含）
        :return: 按序号升序的片段
        """
        filters = _readable_filters([{"term": {"item_key": item_key}}])
        if start_page is not None or end_page is not None:
            page_range: dict[str, int] = {}
            if start_page is not None:
                page_range["gte"] = start_page
            if end_page is not None:
                page_range["lte"] = end_page
            filters.append({"range": {"page_no": page_range}})
        chunks: list[ChunkHit] = []
        search_after: list[Any] | None = None
        while len(chunks) < MAX_SCAN_CHUNKS:
            kwargs: dict[str, Any] = {
                "index": CHUNK_ALIAS,
                "query": {"bool": {"filter": filters}},
                "size": SCAN_PAGE_SIZE,
                "sort": [{"chunk_index": "asc"}],
                "_source": CHUNK_SOURCE,
            }
            if search_after is not None:
                kwargs["search_after"] = search_after
            response = await self._client.search(**kwargs)
            hits = response["hits"]["hits"]
            chunks.extend(_hit(item.get("_source") or {}) for item in hits)
            if len(hits) < SCAN_PAGE_SIZE:
                break
            search_after = hits[-1].get("sort")
        return chunks

    async def matching_item_keys(self, item_keys: list[str], filters: list[dict[str, Any]]) -> set[str]:
        """返回同时满足预过滤条件的条目键。

        :param item_keys: 待确认的条目键
        :param filters: 预过滤条件
        :return: 通过的条目键
        """
        if not item_keys:
            return set()
        response = await self._client.search(
            index=ITEM_ALIAS,
            query={"bool": {"filter": _readable_filters([{"terms": {"item_key": list(item_keys)}}, *filters])}},
            size=len(item_keys),
            _source=["item_key"],
        )
        return {str((item.get("_source") or {}).get("item_key")) for item in response["hits"]["hits"]}

    async def item_parent(self, item_key: str) -> str | None:
        """读取条目的上级引用。

        :param item_key: 条目键
        :return: 上级引用，条目不在索引中时为空
        """
        response = await self._client.search(
            index=ITEM_ALIAS,
            query={"bool": {"filter": _readable_filters([{"term": {"item_key": item_key}}])}},
            size=1,
            _source=["parent_ref"],
        )
        hits = response["hits"]["hits"]
        return (hits[0].get("_source") or {}).get("parent_ref") if hits else None

    async def phrase_candidates(self, pattern: str, filters: list[dict[str, Any]], limit: int) -> list[str]:
        """用短语匹配缩小字面查找的候选条目。

        :param pattern: 字面字符串
        :param filters: 预过滤条件
        :param limit: 最多候选条目数
        :return: 条目键列表
        """
        response = await self._client.search(
            index=CHUNK_ALIAS,
            query={"bool": {"must": [{"match_phrase": {"content": pattern}}],
                            "filter": _readable_filters(filters)}},
            collapse={"field": "item_key"},
            size=limit,
            _source=["item_key"],
        )
        keys: list[str] = []
        for item in response["hits"]["hits"]:
            key = str((item.get("_source") or {}).get("item_key") or "")
            if key and key not in keys:
                keys.append(key)
        return keys
