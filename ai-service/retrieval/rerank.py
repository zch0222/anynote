"""重排接口：一期没有重排协议实现，开关打开时也跳过并记录状态。

@author 称霸幼儿园
"""

from typing import Protocol

from retrieval.models import FusedCandidate

RERANK_DISABLED = "disabled"
RERANK_UNAVAILABLE = "unavailable"
RERANK_APPLIED = "applied"


class Reranker(Protocol):
    """对融合后的候选重新打分。"""

    async def rerank(self, query: str, candidates: list[FusedCandidate]) -> list[FusedCandidate] | None:
        """返回重排后的候选；无法重排时返回 None。"""


class UnavailableReranker:
    """未接入任何重排服务的占位实现。

    @author 称霸幼儿园
    """

    async def rerank(self, query: str, candidates: list[FusedCandidate]) -> list[FusedCandidate] | None:
        """始终返回 None，表示本次跳过重排。

        :param query: 用户查询
        :param candidates: 融合后的候选
        :return: None
        """
        return None


async def maybe_rerank(
    reranker: Reranker,
    enabled: bool,
    query: str,
    candidates: list[FusedCandidate],
) -> tuple[list[FusedCandidate], str]:
    """按开关执行重排，失败或未接入时保持原顺序。

    :param reranker: 重排实现
    :param enabled: 检索参数中的开关
    :param query: 用户查询
    :param candidates: 融合后的候选
    :return: （候选, 重排状态）
    """
    if not enabled:
        return candidates, RERANK_DISABLED
    result = await reranker.rerank(query, candidates)
    if result is None:
        return candidates, RERANK_UNAVAILABLE
    return result, RERANK_APPLIED
