"""预算与无进展检测中间件。

@author 称霸幼儿园
"""

import difflib

from core.errors import BUDGET_EXHAUSTED_MESSAGE
from harness.middleware import HarnessMiddleware, Hook, MiddlewareContext, MiddlewareDecision
from harness.models import Observation, RunOutcome


class BudgetMiddleware(HarnessMiddleware):
    """在固定挂载点检查五类运行预算。

    @author 称霸幼儿园
    """

    async def handle(self, context: MiddlewareContext) -> MiddlewareDecision:
        """检查当前阶段的预算。

        :param context: 中间件输入
        :return: 放行、提示或预算耗尽决定
        """
        run = context.run
        runtime = run.runtime
        if context.hook == Hook.BEFORE_PREPARE:
            if run.elapsed_s >= runtime.wall_clock_s:
                return self._exhausted("WALL_CLOCK")
            hints = []
            if run.model_turns >= runtime.model_turns * 0.8:
                hints.append("模型轮数接近上限，请使用已有信息收束。")
            if run.tool_calls >= runtime.tool_calls * 0.8:
                hints.append("工具调用数接近上限，请使用已有信息收束。")
            return MiddlewareDecision(append=hints)
        if context.hook == Hook.AFTER_PREPARE:
            token_count = getattr(context.payload, "token_count", 0)
            if token_count > runtime.context_tokens:
                return self._exhausted("CONTEXT_TOKENS")
        if context.hook == Hook.BEFORE_MODEL and run.model_turns >= runtime.model_turns:
            return self._exhausted("MODEL_TURNS")
        if context.hook == Hook.BEFORE_ACT:
            calls = context.payload or []
            if run.tool_calls + len(calls) > runtime.tool_calls:
                return self._exhausted("TOOL_CALLS")
        return MiddlewareDecision()

    @staticmethod
    def _exhausted(category: str) -> MiddlewareDecision:
        return MiddlewareDecision.short_circuit(
            RunOutcome.FAILED,
            f"BUDGET_{category}",
            BUDGET_EXHAUSTED_MESSAGE,
        )


class NoProgressMiddleware(HarnessMiddleware):
    """检测重复行动、证据停滞和重复错误。

    @author 称霸幼儿园
    """

    def __init__(self, similarity_threshold: float = 0.95):
        self._similarity_threshold = similarity_threshold

    async def handle(self, context: MiddlewareContext) -> MiddlewareDecision:
        """分析一轮行动是否取得进展。

        :param context: 行动后中间件输入
        :return: 无进展提示或强制收束状态变更
        """
        if context.hook != Hook.AFTER_ACT:
            return MiddlewareDecision()
        run = context.run
        observations: list[Observation] = context.payload or []
        signatures = [item.action_key for item in observations]
        previous = run.action_signatures[-len(signatures):] if signatures else []
        repeated_call = len(previous) == len(signatures) and bool(signatures) and all(
            self.similar(left, right) for left, right in zip(previous, signatures, strict=True)
        )
        fingerprint = run.workspace.evidence_fingerprint()
        unchanged_evidence = bool(run.evidence_fingerprints) and fingerprint == run.evidence_fingerprints[-1]
        errors = [item.error_category.value for item in observations if item.error_category]
        repeated_error = bool(errors) and errors == run.action_errors[-len(errors):]
        run.action_signatures.extend(signatures)
        run.evidence_fingerprints.append(fingerprint)
        run.action_errors.extend(errors)
        if repeated_call or unchanged_evidence or repeated_error:
            run.no_progress_strikes += 1
        else:
            run.no_progress_strikes = 0
        if run.no_progress_strikes >= 2:
            return MiddlewareDecision(
                state_updates={"force_finish": True},
                append=["连续行动没有新增进展，停止检索并直接给出结果。"],
            )
        if run.no_progress_strikes == 1:
            return MiddlewareDecision(append=["上一轮没有新增进展，请更换方法或参数。"])
        return MiddlewareDecision()

    def similar(self, left: str, right: str) -> bool:
        """比较两个参数摘要是否几乎相同。

        :param left: 左侧摘要
        :param right: 右侧摘要
        :return: 相似度达到阈值时返回 true
        """
        return difflib.SequenceMatcher(None, left, right).ratio() >= self._similarity_threshold
