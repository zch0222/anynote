"""融合排序、权威性加权、每实体限量、查询特征分析与重排开关单元测试。

@author 称霸幼儿园
"""

import pytest

from retrieval.fusion import apply_authority, limit_per_entity, reciprocal_rank_fusion
from retrieval.models import ChunkHit, FusedCandidate
from retrieval.query_analysis import KIND_DEFAULT, KIND_KEYWORD, KIND_QUESTION, analyze_query, extract_phrases
from retrieval.rerank import RERANK_APPLIED, RERANK_DISABLED, RERANK_UNAVAILABLE, UnavailableReranker, maybe_rerank
from retrieval.settings import RetrievalSettings


def _hit(item_key: str, index: int | None, authority: str = "original", content: str = "x") -> ChunkHit:
    return ChunkHit(item_key=item_key, ref=item_key.split("#")[0], entity_type="note", subtype=None, kb_id=1,
                    title="t", chunk_index=index, content=content, authority=authority)


def test_rrf_sums_weighted_reciprocal_ranks():
    """两路都命中的位置得分为各路 w/(k+rank) 之和，并按分数降序。"""
    fused = reciprocal_rank_fusion(
        {"lexical": [_hit("note:1", 0), _hit("note:2", 0)], "semantic": [_hit("note:2", 0)]},
        {"lexical": 1.0, "semantic": 2.0},
        k=60,
    )
    assert [item.hit.key for item in fused] == ["note:2#0", "note:1#0"]
    assert fused[0].score == pytest.approx(1.0 / 62 + 2.0 / 61)
    assert fused[0].ranks == {"lexical": 2, "semantic": 1}


def test_rrf_skips_zero_weight_channel_and_maps_item_hit_to_first_chunk():
    """权重为 0 的通道不参与；条目级命中按首个片段参与融合，内容取片段命中。"""
    fused = reciprocal_rank_fusion(
        {"item": [_hit("note:1", None, content="")], "lexical": [_hit("note:1", 0, content="正文")],
         "semantic": [_hit("note:9", 0)]},
        {"item": 0.8, "lexical": 1.0, "semantic": 0.0},
        k=60,
    )
    assert [item.hit.key for item in fused] == ["note:1#0"]
    assert fused[0].hit.content == "正文"
    assert set(fused[0].ranks) == {"item", "lexical"}


def test_rrf_ignores_duplicate_positions_within_one_channel():
    """同一通道内重复位置只计第一次。"""
    fused = reciprocal_rank_fusion({"lexical": [_hit("note:1", 0), _hit("note:1", 0)]}, {"lexical": 1.0}, k=60)
    assert len(fused) == 1
    assert fused[0].score == pytest.approx(1.0 / 61)


def test_authority_lowers_generated_content():
    """模型生成内容按系数降权，原始内容优先。"""
    settings = RetrievalSettings()
    candidates = [FusedCandidate(hit=_hit("mooc_item:1#summary", 0, "generated"), score=1.0),
                  FusedCandidate(hit=_hit("note:2", 0, "original"), score=0.8)]
    ranked = apply_authority(candidates, settings)
    assert [item.hit.item_key for item in ranked] == ["note:2", "mooc_item:1#summary"]
    assert ranked[1].score == pytest.approx(0.7)


def test_limit_per_entity_keeps_order():
    """同一实体最多保留指定数量的片段，保持原顺序。"""
    candidates = [FusedCandidate(hit=_hit("note:1", i), score=1.0 - i / 10) for i in range(4)]
    candidates.insert(1, FusedCandidate(hit=_hit("note:2", 0), score=0.95))
    kept = limit_per_entity(candidates, 2)
    assert [item.hit.key for item in kept] == ["note:1#0", "note:2#0", "note:1#1"]


@pytest.mark.parametrize(
    ("query", "kind", "signal"),
    [
        ("“倒排索引”的定义", KIND_KEYWORD, "quoted"),
        ("订单 202611150001", KIND_KEYWORD, "long_number"),
        ("kb_search 参数", KIND_KEYWORD, "code_like"),
        ("索引", KIND_KEYWORD, "short"),
        ("倒排索引和正排索引有什么区别", KIND_QUESTION, None),
        ("期末复习资料整理计划表", KIND_DEFAULT, None),
    ],
)
def test_query_analysis_kinds(query, kind, signal):
    """引号、长数字、代码样式、短词判为关键词型；完整问句判为问句型。"""
    features = analyze_query(query, RetrievalSettings())
    assert features.kind == kind
    if signal:
        assert signal in features.signals


def test_query_weights_follow_settings_and_mode():
    """权重取自检索参数；keyword/semantic 模式只保留对应通道。"""
    settings = RetrievalSettings(keywordLexicalWeight=2.0, keywordSemanticWeight=0.3)
    auto = analyze_query("“原话”", settings)
    assert (auto.lexical_weight, auto.semantic_weight) == (2.0, 0.3)
    assert analyze_query("“原话”", settings, "keyword").semantic_weight == 0.0
    assert analyze_query("“原话”", settings, "semantic").lexical_weight == 0.0


def test_extract_phrases_supports_chinese_quotes():
    """中英文引号里的原话都被提取并去重。"""
    assert extract_phrases('"A B" 与 “知识库” 以及 "A B"') == ["A B", "知识库"]


async def test_rerank_switch_states():
    """关闭时不调用重排；打开但未接入时保持原顺序并标记不可用。"""
    candidates = [FusedCandidate(hit=_hit("note:1", 0), score=1.0)]
    assert await maybe_rerank(UnavailableReranker(), False, "q", candidates) == (candidates, RERANK_DISABLED)
    assert await maybe_rerank(UnavailableReranker(), True, "q", candidates) == (candidates, RERANK_UNAVAILABLE)

    class Reverse:
        async def rerank(self, query, items):
            return list(reversed(items))

    two = [*candidates, FusedCandidate(hit=_hit("note:2", 0), score=0.5)]
    result, status = await maybe_rerank(Reverse(), True, "q", two)
    assert status == RERANK_APPLIED
    assert [item.hit.item_key for item in result] == ["note:2", "note:1"]
