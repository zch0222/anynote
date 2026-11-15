"""应用层倒数排名融合、权威性加权与每实体限量。

@author 称霸幼儿园
"""

from retrieval.models import ChunkHit, FusedCandidate
from retrieval.settings import RetrievalSettings


def reciprocal_rank_fusion(
    channels: dict[str, list[ChunkHit]],
    weights: dict[str, float],
    k: int,
) -> list[FusedCandidate]:
    """按位置键融合多路结果：score = Σ w / (k + rank)，rank 从 1 起。

    同一位置在多路中出现时保留内容最完整的命中；权重为 0 的通道不参与。

    :param channels: 通道名到有序命中的映射
    :param weights: 通道权重
    :param k: 融合常数
    :return: 按分数降序、位置键升序排列的候选
    """
    fused: dict[str, FusedCandidate] = {}
    for channel, hits in channels.items():
        weight = weights.get(channel, 0.0)
        if weight <= 0:
            continue
        seen: set[str] = set()
        rank = 0
        for hit in hits:
            if hit.key in seen:
                continue
            seen.add(hit.key)
            rank += 1
            candidate = fused.get(hit.key)
            if candidate is None:
                candidate = FusedCandidate(hit=hit, score=0.0)
                fused[hit.key] = candidate
            elif not candidate.hit.content and hit.content:
                candidate.hit = hit
            candidate.score += weight / (k + rank)
            candidate.ranks[channel] = rank
    return sorted(fused.values(), key=lambda item: (-item.score, item.hit.key))


def apply_authority(candidates: list[FusedCandidate], settings: RetrievalSettings) -> list[FusedCandidate]:
    """按权威性系数调整分数并重新排序。

    :param candidates: 融合后的候选
    :param settings: 检索参数
    :return: 调整后的候选
    """
    for candidate in candidates:
        candidate.score *= settings.authority_factor(candidate.hit.authority)
    return sorted(candidates, key=lambda item: (-item.score, item.hit.key))


def limit_per_entity(candidates: list[FusedCandidate], per_entity: int) -> list[FusedCandidate]:
    """同一实体最多保留 per_entity 个位置，保持原有顺序。

    :param candidates: 有序候选
    :param per_entity: 每实体上限
    :return: 限量后的候选
    """
    counts: dict[str, int] = {}
    kept: list[FusedCandidate] = []
    for candidate in candidates:
        used = counts.get(candidate.hit.item_key, 0)
        if used >= per_entity:
            continue
        counts[candidate.hit.item_key] = used + 1
        kept.append(candidate)
    return kept
