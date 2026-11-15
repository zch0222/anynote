"""混合检索：全文、语义、条目级三路召回，融合、限量、重排、第二段权限与相邻扩展。

@author 称霸幼儿园
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Protocol

from core.logger import get_logger
from harness.models import EvidenceItem
from models.catalog import ModelCatalogSnapshot, ModelError
from retrieval.fusion import apply_authority, limit_per_entity, reciprocal_rank_fusion
from retrieval.index_reader import KnowledgeIndexReader
from retrieval.models import (
    NO_MATCH_MESSAGE,
    SEMANTIC_UNAVAILABLE_MESSAGE,
    STALE_MESSAGE,
    ChunkHit,
    FusedCandidate,
)
from retrieval.query_analysis import MODE_AUTO, MODE_SEMANTIC, analyze_query
from retrieval.rerank import Reranker, UnavailableReranker, maybe_rerank
from retrieval.session import RetrievalSession

CHANNEL_LEXICAL = "lexical"
CHANNEL_SEMANTIC = "semantic"
CHANNEL_ITEM = "item"
GRANULARITY_CHUNK = "chunk"
GRANULARITY_ITEM = "item"
TRACE_TOP = 20
SEMANTIC_OK = "ok"
SEMANTIC_DISABLED = "disabled"
SEMANTIC_UNAVAILABLE = "unavailable"


class Embedder(Protocol):
    """生成查询向量。"""

    async def embed(self, snapshot: ModelCatalogSnapshot, texts: list[str]) -> list[list[float]] | None:
        """返回向量；未启用嵌入时返回 None。"""


@dataclass
class SearchRequest:
    """`kb_search` 的检索参数。

    @author 称霸幼儿园
    """

    query: str
    kb_ids: list[int] = field(default_factory=list)
    entity_types: list[str] = field(default_factory=list)
    granularity: str = GRANULARITY_CHUNK
    updated_after: date | None = None
    updated_before: date | None = None
    limit: int | None = None
    mode: str = MODE_AUTO


@dataclass
class SearchOutcome:
    """检索结果：证据、给模型的紧凑结果、提示与 Trace 诊断。

    @author 称霸幼儿园
    """

    evidence: list[EvidenceItem]
    results: list[dict[str, Any]]
    notices: list[str]
    diagnostics: dict[str, Any]


def locator_from_chunks(chunks: list[ChunkHit], section_path: str | None) -> dict[str, Any]:
    """由连续片段生成定位符：片段序号、标题路径、页码与时间范围。

    :param chunks: 按序号排列的片段
    :param section_path: 命中片段的标题路径
    :return: 去掉空值的定位符
    """
    indexes = [chunk.chunk_index for chunk in chunks if chunk.chunk_index is not None]
    pages = [chunk.page_no for chunk in chunks if chunk.page_no is not None]
    starts = [chunk.start_ms for chunk in chunks if chunk.start_ms is not None]
    ends = [chunk.end_ms for chunk in chunks if chunk.end_ms is not None]
    locator = {
        "chunkStart": min(indexes) if indexes else None,
        "chunkEnd": max(indexes) if indexes else None,
        "sectionPath": section_path,
        "pageStart": min(pages) if pages else None,
        "pageEnd": max(pages) if pages else None,
        "startMs": min(starts) if starts else None,
        "endMs": max(ends) if ends else None,
    }
    return {key: value for key, value in locator.items() if value is not None}


def expand_neighbors(
    selected: list[ChunkHit],
    around: dict[str, dict[int, ChunkHit]],
    window: int,
    max_chars: int,
) -> list[list[ChunkHit]]:
    """按排名依次给命中片段补相邻片段，总字数不超过上限；命中片段本身始终保留，
    已是其他命中或已被补入的片段不重复补入。

    :param selected: 已排序的命中片段
    :param around: 条目键到 {序号: 片段} 的映射
    :param window: 前后最多补几片
    :param max_chars: 扩展后的总字数上限
    :return: 每个命中对应的连续片段
    """
    groups: list[list[ChunkHit]] = []
    included = {(hit.item_key, hit.chunk_index) for hit in selected if hit.chunk_index is not None}
    for hit in selected:
        base = around.get(hit.item_key, {}).get(hit.chunk_index) if hit.chunk_index is not None else None
        groups.append([base or hit])
    total = sum(len(group[0].content) for group in groups)
    for hit, group in zip(selected, groups, strict=True):
        if hit.chunk_index is None:
            continue
        neighbors = around.get(hit.item_key, {})
        for distance in range(1, window + 1):
            for index in (hit.chunk_index - distance, hit.chunk_index + distance):
                chunk = neighbors.get(index)
                if chunk is None or (hit.item_key, index) in included or total + len(chunk.content) > max_chars:
                    continue
                group.append(chunk)
                included.add((hit.item_key, index))
                total += len(chunk.content)
        group.sort(key=lambda chunk: chunk.chunk_index if chunk.chunk_index is not None else -1)
    return groups


class HybridSearcher:
    """`kb_search` 的检索管线。

    @author 称霸幼儿园
    """

    def __init__(self, embedder: Embedder | None, reranker: Reranker | None = None):
        self._embedder = embedder
        self._reranker = reranker or UnavailableReranker()
        self._logger = get_logger(__name__)

    async def search(self, session: RetrievalSession, request: SearchRequest) -> SearchOutcome:
        """执行一次混合检索。

        :param session: 检索会话
        :param request: 检索参数
        :return: 检索结果
        """
        settings = session.settings
        index = session.index_reader()
        filters = [*await session.prefilter(), *self._extra_filters(request)]
        features = analyze_query(request.query, settings, request.mode)
        weights = {
            CHANNEL_LEXICAL: features.lexical_weight,
            CHANNEL_SEMANTIC: features.semantic_weight,
            CHANNEL_ITEM: 0.0 if request.mode == MODE_SEMANTIC else settings.item_weight,
        }
        degraded: list[str] = []
        channels: dict[str, list[ChunkHit]] = {}
        size = settings.channel_candidates
        semantic_status = SEMANTIC_DISABLED
        if weights[CHANNEL_SEMANTIC] > 0:
            vector, semantic_status = await self._query_vector(session, index, request.query)
            if vector is None:
                if semantic_status == SEMANTIC_UNAVAILABLE:
                    degraded.append(CHANNEL_SEMANTIC)
                weights[CHANNEL_SEMANTIC] = 0.0
                if weights[CHANNEL_LEXICAL] <= 0:
                    weights[CHANNEL_LEXICAL] = settings.default_lexical_weight
                    weights[CHANNEL_ITEM] = settings.item_weight
            else:
                channels[CHANNEL_SEMANTIC] = await session.call_index(index.semantic(vector, filters, size))
        if weights[CHANNEL_LEXICAL] > 0:
            channels[CHANNEL_LEXICAL] = await session.call_index(
                index.lexical(request.query, features.phrases, filters, size)
            )
        if weights[CHANNEL_ITEM] > 0:
            channels[CHANNEL_ITEM] = await session.call_index(index.items(request.query, filters, size))

        fused = reciprocal_rank_fusion(channels, weights, settings.rrf_k)
        fused = apply_authority(fused, settings)
        per_entity = 1 if request.granularity == GRANULARITY_ITEM else settings.max_chunks_per_entity
        fused = limit_per_entity(fused, per_entity)
        fused, rerank_status = await maybe_rerank(self._reranker, settings.rerank_enabled, request.query, fused)

        readable = await session.authorize([(item.hit.ref, item.hit.subtype) for item in fused])
        authorized_items = {(item.hit.ref, item.hit.subtype) for item in fused}
        kept = [item for item in fused if (item.hit.ref, item.hit.subtype) in readable]
        dropped_items = len(authorized_items) - len({(item.hit.ref, item.hit.subtype) for item in kept})
        drop_ratio = dropped_items / len(authorized_items) if authorized_items else 0.0
        if dropped_items:
            self._logger.info(
                "检索第二段丢弃 runId=%s dropped=%d authorized=%d ratio=%.3f",
                session.run_id, dropped_items, len(authorized_items), drop_ratio,
            )
        limit = min(request.limit or settings.search_default_limit, settings.search_max_limit)
        selected = kept[:limit]
        evidence, results, stale = await self._materialize(session, index, selected, readable)

        notices: list[str] = []
        if CHANNEL_SEMANTIC in degraded:
            notices.append(SEMANTIC_UNAVAILABLE_MESSAGE)
        if stale:
            notices.append(STALE_MESSAGE)
        if not results:
            notices.append(NO_MATCH_MESSAGE)
        diagnostics = {
            "queryKind": features.kind,
            "signals": features.signals,
            "weights": weights,
            "channels": {name: len(hits) for name, hits in channels.items()},
            "degraded": degraded,
            "semantic": semantic_status,
            "rerank": rerank_status,
            "authorized": len(authorized_items),
            "dropped": dropped_items,
            "dropRatio": round(drop_ratio, 4),
            "top": [
                {"key": item.hit.key, "score": round(item.score, 6), "ranks": item.ranks}
                for item in fused[:TRACE_TOP]
            ],
        }
        return SearchOutcome(evidence=evidence, results=results, notices=notices, diagnostics=diagnostics)

    @staticmethod
    def _extra_filters(request: SearchRequest) -> list[dict[str, Any]]:
        filters: list[dict[str, Any]] = []
        if request.kb_ids:
            filters.append({"terms": {"kb_id": list(request.kb_ids)}})
        if request.entity_types:
            filters.append({"terms": {"entity_type": list(request.entity_types)}})
        if request.updated_after or request.updated_before:
            date_range: dict[str, str] = {}
            if request.updated_after:
                date_range["gte"] = request.updated_after.isoformat()
            if request.updated_before:
                date_range["lt"] = request.updated_before.isoformat()
            filters.append({"range": {"source_updated_at": date_range}})
        return filters

    async def _query_vector(
        self,
        session: RetrievalSession,
        index: KnowledgeIndexReader,
        query: str,
    ) -> tuple[list[float] | None, str]:
        """生成查询向量：未配置嵌入时为关闭，配置了但不可用或与索引不一致时为不可用。

        :param session: 检索会话
        :param index: 索引读取器
        :param query: 查询文本
        :return: （向量, 状态）
        """
        snapshot = session.snapshot
        if self._embedder is None or snapshot is None:
            return None, SEMANTIC_DISABLED
        try:
            resolved = snapshot.resolve_embedding()
        except ModelError:
            return None, SEMANTIC_UNAVAILABLE
        if resolved is None:
            return None, SEMANTIC_DISABLED
        _provider, model, dims = resolved
        active_model, active_dims = await session.call_index(index.active_embedding())
        if active_model is None or active_model != model or (dims is not None and active_dims != dims):
            return None, SEMANTIC_UNAVAILABLE
        try:
            vectors = await self._embedder.embed(snapshot, [query])
        except ModelError:
            return None, SEMANTIC_UNAVAILABLE
        if not vectors or not vectors[0] or (active_dims is not None and len(vectors[0]) != active_dims):
            return None, SEMANTIC_UNAVAILABLE
        return vectors[0], SEMANTIC_OK

    async def _materialize(
        self,
        session: RetrievalSession,
        index: KnowledgeIndexReader,
        selected: list[FusedCandidate],
        readable: dict,
    ) -> tuple[list[EvidenceItem], list[dict[str, Any]], bool]:
        settings = session.settings
        hits: list[ChunkHit] = []
        for candidate in selected:
            hit = candidate.hit
            if hit.chunk_index is None:
                hit = ChunkHit(**{**hit.__dict__, "chunk_index": 0})
            hits.append(hit)
        positions = [(hit.item_key, hit.chunk_index) for hit in hits]
        around = await session.call_index(index.chunks_around(positions, settings.neighbor_window)) if positions else {}
        for position, candidate in zip(hits, selected, strict=True):
            if candidate.hit.chunk_index is None and position.chunk_index not in around.get(position.item_key, {}):
                position.chunk_index = None
        groups = expand_neighbors(hits, around, settings.neighbor_window, settings.neighbor_max_chars)
        scope = await session.scope()
        evidence: list[EvidenceItem] = []
        results: list[dict[str, Any]] = []
        any_stale = False
        for candidate, hit, group in zip(selected, hits, groups, strict=True):
            auth = readable[(hit.ref, hit.subtype)]
            text = "\n".join(chunk.content for chunk in group if chunk.content)
            section_path = next((chunk.section_path for chunk in group if chunk.chunk_index == hit.chunk_index),
                                hit.section_path)
            locator = locator_from_chunks(group, section_path)
            stale = bool(auth.content_version and hit.content_version
                         and auth.content_version != hit.content_version)
            any_stale = any_stale or stale
            item = session.evidence.register(
                item_key=hit.item_key,
                entity_type=hit.entity_type,
                text=text,
                title=hit.title,
                locator=locator,
                kb_id=auth.kb_id,
                kb_name=scope.kb_name(auth.kb_id),
                authority=hit.authority,
                content_version=hit.content_version,
                stale=stale,
                permission_basis=auth.permission_basis,
                retrieval={"channels": candidate.ranks, "score": round(candidate.score, 6),
                           "highlight": candidate.hit.highlight},
                selected_reason="kb_search",
            )
            evidence.append(item)
            results.append({
                "evidenceId": item.evidence_id,
                "ref": hit.ref,
                "subtype": hit.subtype,
                "entityType": hit.entity_type,
                "title": hit.title,
                "kbId": auth.kb_id,
                "locator": locator,
                "authority": hit.authority,
                "stale": stale,
            })
        return evidence, results, any_stale
