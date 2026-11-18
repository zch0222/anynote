"""五阶段 Harness 执行循环。

@author 称霸幼儿园
"""

import asyncio
import time
import uuid

from pydantic import ValidationError

from agents.knowledge_retrieval.agent import AgentFinishArgs, finish_tool_definition
from agents.knowledge_retrieval.citations import scan_answer
from agents.knowledge_retrieval.response import validate_answer
from core.errors import BUDGET_EXHAUSTED_MESSAGE, INTERNAL_ERROR_MESSAGE, RUN_CANCELLED_MESSAGE
from core.logger import get_logger
from harness.action.plane import ActionPlane, FatalActionError
from harness.action.registry import ToolRegistry
from harness.budget import BudgetMiddleware, NoProgressMiddleware
from harness.context.builder import ContextBuilder
from harness.events import EventBus
from harness.middleware import (
    DecisionType,
    HarnessMiddleware,
    Hook,
    MiddlewareChain,
    MiddlewareContext,
    MiddlewareDecision,
)
from harness.models import RunContext, RunOutcome, RunState, TokenUsage, ToolExchange
from harness.state import RunStateMachine
from harness.trace.middleware import TraceMiddleware
from harness.view.events import ReasoningBlock
from harness.view.middleware import RunViewMiddleware, _target_label
from harness.verify.framework import VerificationIssue, VerificationReport, VerifierFramework
from models.base import ChatModel
from models.catalog import ModelError

EMPTY_OUTPUT_HINT = "本轮没有正文或工具调用，请直接回答或调用所需工具。"
EMPTY_MODEL_OUTPUT_MESSAGE = "模型没有返回内容，请重试"
FINISH_WITH_TOOLS_HINT = "agent_finish 需要单独调用；本轮已先执行其他工具，请看过结果后再提交。"
MULTIPLE_FINISH_HINT = "agent_finish 每轮只能调用一次，请重新提交。"
INVALID_FINISH_HINT = "agent_finish 参数不合法（{details}），请按工具定义重新提交。"


class RunViewMiddlewareShared(HarnessMiddleware):
    """把共享的过程记录器挂到中间件链。

    @author 称霸幼儿园
    """

    def __init__(self, view: RunViewMiddleware):
        self._view = view

    async def handle(self, context: MiddlewareContext) -> MiddlewareDecision:
        """转发到共享过程记录器。

        :param context: 中间件输入
        :return: 始终放行
        """
        return await self._view.handle(context)


def _validation_details(error: ValidationError, limit: int = 3) -> str:
    """把终态参数的校验错误压缩成给模型看的一行提示。

    :param error: Pydantic 校验错误
    :param limit: 最多列出的错误条数
    :return: 形如「answer: ...; reasoning: ...」的说明
    """
    parts = []
    for item in error.errors()[:limit]:
        location = ".".join(str(part) for part in item.get("loc", ())) or "arguments"
        parts.append(f"{location}: {item.get('msg', 'invalid')}")
    return "; ".join(parts)


class Harness:
    """执行 Prepare、Model、Act、Observe、Verify 五阶段循环。

    @author 称霸幼儿园
    """

    def __init__(
        self,
        model: ChatModel,
        registry: ToolRegistry | None = None,
        verifier: VerifierFramework | None = None,
        middlewares: list[HarnessMiddleware] | None = None,
        context_builder: ContextBuilder | None = None,
    ):
        self._model = model
        self._registry = registry or ToolRegistry()
        self._action = ActionPlane(self._registry)
        self._verifier = verifier or VerifierFramework()
        self._builder = context_builder or ContextBuilder(model)
        self._custom_middlewares = middlewares or []
        self._logger = get_logger(__name__)
        self._view: RunViewMiddleware | None = None

    async def run(self, context: RunContext, events: EventBus) -> None:
        """运行到完成、失败或取消终态。

        :param context: 单次运行状态
        :param events: 运行事件总线
        """
        machine = RunStateMachine()
        self._view = RunViewMiddleware(events)
        chain = MiddlewareChain(
            [
                BudgetMiddleware(),
                *self._custom_middlewares,
                NoProgressMiddleware(),
                RunViewMiddlewareShared(self._view),
                TraceMiddleware(events, view=self._view),
            ],
            events=events,
        )
        signal_attempts = 0
        previous_finish_problem = None
        try:
            pre_run_error = None
            try:
                decision = await chain.invoke(Hook.BEFORE_RUN, context)
            except Exception as error:
                pre_run_error = error
            await events.emit(
                "run.started",
                {
                    "agent": context.agent.name,
                    "agentVersion": context.agent.version,
                    "model": context.request.model or context.agent.main_model,
                    "scope": context.request.scope.model_dump(by_alias=True) if context.request.scope else None,
                    "scopeSummary": context.scope_summary,
                },
            )
            if pre_run_error is not None:
                raise pre_run_error
            if self._short_circuited(decision):
                await self._finish_short_circuit(context, events, machine, chain, decision)
                return
            await self._transition(context, events, machine, chain, RunState.RUNNING)
            while True:
                self._check_cancelled(context)
                decision = await chain.invoke(Hook.BEFORE_PREPARE, context)
                if self._short_circuited(decision):
                    await self._finish_short_circuit(context, events, machine, chain, decision)
                    return
                tools = [] if context.force_finish else self._registry.definitions(context.agent.tools)
                if context.agent.terminal_tool:
                    tools.append(finish_tool_definition())
                prepared = await self._builder.build(context, tools)
                decision = await chain.invoke(Hook.AFTER_PREPARE, context, prepared)
                if self._short_circuited(decision):
                    await self._finish_short_circuit(context, events, machine, chain, decision)
                    return
                prepared = decision.payload
                if prepared.additional_usage.known or context.history:
                    await self._add_usage(context, events, prepared.additional_usage)
                decision = await chain.invoke(Hook.BEFORE_MODEL, context, prepared)
                if self._short_circuited(decision):
                    await self._finish_short_circuit(context, events, machine, chain, decision)
                    return
                context.model_turns += 1
                calls, turn_usage, finish_signal, finish_problem = await self._call_model(
                    context, events, prepared
                )
                await self._add_usage(context, events, turn_usage)
                await chain.invoke(
                    Hook.AFTER_MODEL,
                    context,
                    {
                        "turn": context.model_turns,
                        "textLength": len(context.answer),
                        "toolCalls": len(calls),
                        "usage": turn_usage.model_dump(mode="json", by_alias=True),
                    },
                )
                if calls and not context.force_finish:
                    decision = await chain.invoke(Hook.BEFORE_ACT, context, calls)
                    if self._short_circuited(decision):
                        await self._finish_short_circuit(context, events, machine, chain, decision)
                        return
                    observations = await self._act(context, events, calls)
                    decision = await chain.invoke(Hook.AFTER_ACT, context, observations)
                    if self._short_circuited(decision):
                        await self._finish_short_circuit(context, events, machine, chain, decision)
                        return
                    continue
                if calls and context.force_finish:
                    context.error_category = "NO_PROGRESS"
                    context.error_message = BUDGET_EXHAUSTED_MESSAGE
                    await self._fail(context, events, machine, chain)
                    return
                if context.agent.terminal_tool:
                    if finish_signal is None:
                        problem = finish_problem or EMPTY_OUTPUT_HINT
                        if signal_attempts == 0:
                            signal_attempts += 1
                            previous_finish_problem = problem
                            context.hints.append(problem)
                            continue
                        context.error_category = (
                            "EMPTY_MODEL_OUTPUT"
                            if problem == EMPTY_OUTPUT_HINT
                            and previous_finish_problem == EMPTY_OUTPUT_HINT
                            else "INTERNAL"
                        )
                        context.error_message = (
                            EMPTY_MODEL_OUTPUT_MESSAGE
                            if context.error_category == "EMPTY_MODEL_OUTPUT"
                            else INTERNAL_ERROR_MESSAGE
                        )
                        await self._fail(context, events, machine, chain)
                        return
                    await self._transition(context, events, machine, chain, RunState.VERIFYING)
                    decision = await chain.invoke(Hook.BEFORE_VERIFY, context)
                    if self._short_circuited(decision):
                        await self._finish_short_circuit(context, events, machine, chain, decision)
                        return
                    repair_exhausted = context.verification_attempts > 0
                    citation_scan = (
                        scan_answer((finish_signal.answer or "").strip())
                        if finish_signal.outcome == "ANSWERED"
                        else None
                    )
                    validated = validate_answer(
                        finish_signal,
                        context.workspace.evidence,
                        context.scope_summary,
                        tool_calls=context.tool_calls,
                        repair_exhausted=repair_exhausted,
                        citation_scan=citation_scan,
                    )
                    base_report = self._verifier.verify(context)
                    report = VerificationReport(
                        issues=[
                            *base_report.issues,
                            *(
                                VerificationIssue(
                                    code=issue.code,
                                    detail=issue.detail,
                                    indices=issue.indices,
                                    repairable=issue.repairable,
                                )
                                for issue in validated.issues
                            ),
                        ],
                        diagnostics={
                            **base_report.diagnostics,
                            **(citation_scan.trace_attributes() if citation_scan else {}),
                        },
                    )
                    await chain.invoke(Hook.AFTER_VERIFY, context, report)
                    if not report.passed and not repair_exhausted:
                        context.verification_attempts += 1
                        context.hints.append(
                            self._repair_hint(report.issues, context.workspace.evidence)
                        )
                        context.answer = ""
                        await self._transition(context, events, machine, chain, RunState.RUNNING)
                        continue
                    context.answer = validated.answer
                    context.answer_notices = validated.answer_notices
                    context.outcome = validated.outcome
                    for index, item, snippet in validated.citations:
                        await events.emit(
                            "citation",
                            {
                                "index": index,
                                "evidenceId": item.evidence_id,
                                "sourceType": item.source_type,
                                "sourceId": item.source_id,
                                "title": item.title,
                                "locator": item.locator,
                                "snippet": snippet,
                                "stale": item.stale,
                                "authority": item.authority,
                                "kbId": item.kb_id,
                                "kbName": item.kb_name,
                                "permissionBasis": item.permission_basis,
                            },
                        )
                    if context.answer:
                        await events.emit("text.delta", {"delta": context.answer})
                    await self._transition(context, events, machine, chain, RunState.COMPLETED)
                    await self._finish(context, events)
                    return
                await self._transition(context, events, machine, chain, RunState.VERIFYING)
                decision = await chain.invoke(Hook.BEFORE_VERIFY, context)
                if self._short_circuited(decision):
                    await self._finish_short_circuit(context, events, machine, chain, decision)
                    return
                report = self._verifier.verify(context)
                await chain.invoke(Hook.AFTER_VERIFY, context, report)
                if report.passed:
                    context.outcome = RunOutcome.ANSWERED
                    await self._transition(context, events, machine, chain, RunState.COMPLETED)
                    await self._finish(context, events)
                    return
                if context.verification_attempts == 0:
                    context.verification_attempts += 1
                    context.hints.append(
                        "结果验证未通过: " + ",".join(issue.code for issue in report.issues)
                    )
                    context.answer = ""
                    await self._transition(context, events, machine, chain, RunState.RUNNING)
                    continue
                context.error_category = "VALIDATION_FAILED"
                context.error_message = INTERNAL_ERROR_MESSAGE
                await self._fail(context, events, machine, chain)
                return
        except asyncio.CancelledError:
            context.cancel()
            context.outcome = RunOutcome.CANCELLED
            context.error_category = "CANCELLED"
            context.error_message = RUN_CANCELLED_MESSAGE
            if not machine.terminal:
                await self._transition(context, events, machine, chain, RunState.CANCELLED)
            await events.emit(
                "error",
                {"category": "CANCELLED", "retryable": False, "message": RUN_CANCELLED_MESSAGE},
            )
            await self._finish(context, events)
        except ModelError as error:
            context.error_category = error.category
            context.error_message = error.message
            await self._fail(context, events, machine, chain)
        except FatalActionError as error:
            context.error_category = error.category
            context.error_message = INTERNAL_ERROR_MESSAGE
            await self._fail(context, events, machine, chain)
        except Exception as error:
            self._logger.error(
                "Harness 运行异常 runId=%s type=%s",
                context.run_id,
                type(error).__name__,
                exc_info=True,
            )
            context.error_category = "INTERNAL"
            context.error_message = INTERNAL_ERROR_MESSAGE
            await self._fail(context, events, machine, chain)
        finally:
            await chain.invoke(Hook.AFTER_RUN, context)

    async def _call_model(self, context: RunContext, events: EventBus, prepared):
        """调用一次模型并拆出工具调用与完成申请。

        :param context: 当前运行
        :param events: 运行事件总线
        :param prepared: 编译后的上下文
        :return: （工具调用, 用量, 终态信号, 终态问题提示）
        """
        calls = []
        finish_calls = []
        buffered_text = []
        usage = TokenUsage()
        structured = context.agent.terminal_tool is not None
        view = self._view
        block: ReasoningBlock | None = None
        async for chunk in self._model.stream(
            context.request.model or context.agent.main_model,
            context.model_snapshot,
            prepared.messages,
            prepared.tools,
            context.runtime,
            bool(context.request.scope or context.workspace.evidence or context.tool_exchanges),
        ):
            self._check_cancelled(context)
            if chunk.reasoning_interrupted:
                if view is not None and block is not None:
                    block.close(time.monotonic(), "interrupted")
                    if context.runtime.reasoning_view_enabled:
                        await events.emit("reasoning.finished", {
                            "blockId": block.block_id,
                            "durationMs": block.duration_ms,
                            "status": "interrupted",
                        })
                    block = None
                if view is not None:
                    await view.mark_retry(context)
                continue
            if chunk.reasoning_delta and view is not None:
                if block is None:
                    block = ReasoningBlock(
                        block_id=uuid.uuid4().hex[:16],
                        turn=context.model_turns,
                    )
                await view.note_reasoning(context, context.model_turns, chunk.reasoning_delta, block, first=len(block.text) == 0)
            if chunk.text_delta:
                if structured:
                    buffered_text.append(chunk.text_delta)
                else:
                    context.answer += chunk.text_delta
                    await events.emit("text.delta", {"delta": chunk.text_delta})
            if chunk.usage:
                usage = usage.plus(chunk.usage)
            for call in chunk.tool_calls or []:
                if structured and call.name == context.agent.terminal_tool:
                    finish_calls.append(call)
                else:
                    calls.append(call)
        if view is not None and block is not None:
            await view.finish_reasoning_block(context, block)
        if not structured:
            return calls, usage, None, None
        context.answer = ""
        text = "".join(buffered_text)
        if view is not None and text.strip() and calls:
            await view.note_step(context, context.model_turns, text)
        if not finish_calls:
            if calls and not context.force_finish:
                return calls, usage, None, None
            if text.strip():
                try:
                    finish_signal = AgentFinishArgs(outcome="ANSWERED", answer=text)
                except ValidationError as error:
                    return [], usage, None, INVALID_FINISH_HINT.format(
                        details=_validation_details(error)
                    )
                context.answer = finish_signal.answer or ""
                return [], usage, finish_signal, None
            if calls and context.force_finish:
                return calls, usage, None, None
            return [], usage, None, EMPTY_OUTPUT_HINT
        if calls and not context.force_finish:
            context.hints.append(FINISH_WITH_TOOLS_HINT)
            return calls, usage, None, None
        if len(finish_calls) > 1:
            return [], usage, None, MULTIPLE_FINISH_HINT
        try:
            finish_signal = AgentFinishArgs.model_validate(finish_calls[0].arguments)
        except ValidationError as error:
            return [], usage, None, INVALID_FINISH_HINT.format(details=_validation_details(error))
        if finish_signal.outcome == "ANSWERED":
            if not (finish_signal.answer or "").strip():
                finish_signal = finish_signal.model_copy(update={"answer": text})
            context.answer = finish_signal.answer or ""
        return [], usage, finish_signal, None

    @staticmethod
    def _repair_hint(issues: list[VerificationIssue], evidence) -> str:
        """把一次 Verify 的缺口整理成下一轮修复提示。"""
        lines = ["上一次回答没有通过校验，请修改后重新提交："]
        evidence_by_id = {item.evidence_id: item for item in evidence}
        for issue in issues:
            if issue.code == "INVALID_CITATION":
                for index in issue.indices:
                    if f"E{index}" not in evidence_by_id:
                        lines.append(
                            f"- [{index}] 不存在：本次运行没有证据 E{index}，请删除或改成正确的编号。"
                        )
                    else:
                        lines.append(
                            f"- [{index}] 附的原文没有出现在证据 E{index} 里：请逐字摘取，或者不附原文。"
                        )
            elif issue.code == "MISSING_CITATION":
                available = "、".join(
                    f"[{item.evidence_id[1:]}] {item.source_type}「{item.title or item.source_id}」"
                    for item in evidence[:10]
                )
                if len(evidence) > 10:
                    available += f"；共 {len(evidence)} 条证据，仅列前 10 条"
                lines.append(
                    "- 回答用到了工具结果，但没有标注来源。可以引用的证据："
                    f"{available}。在用到对应证据的句子后写 [n]。"
                )
            elif issue.code == "EMPTY_ANSWER":
                lines.append("- 回答为空，请重新给出回答。")
            else:
                lines.append(f"- {issue.detail or issue.code}")
        return "\n".join(lines)

    async def _act(self, context: RunContext, events: EventBus, calls):
        specs = [self._registry.get(call.name) for call in calls]
        # 用户视图的工具事件由过程投影统一生成（带 target 与 result），核心循环只负责执行
        if self._view is None:
            for call, spec in zip(calls, specs, strict=True):
                await events.emit(
                    "tool.started",
                    {
                        "callId": call.call_id,
                        "name": call.name,
                        "summary": spec.summary if spec else call.name,
                    },
                )
        results = await asyncio.gather(
            *(self._action.execute(context, call) for call in calls)
        )
        observations = []
        context.tool_calls += len(results)
        for result in results:
            observation = self._action.observe(context, result)
            observations.append(observation)
            if self._view is None:
                await events.emit(
                    "tool.finished",
                    {
                        "callId": result.call_id,
                        "name": result.tool_name,
                        "status": result.status.value,
                        "hitCount": len(result.evidence),
                        "durationMs": result.duration_ms,
                        "errorCategory": result.error_category.value if result.error_category else None,
                        "retryable": result.retryable,
                    },
                )
        context.tool_exchanges.append(ToolExchange(calls=list(calls), observations=observations))
        return observations

    async def _add_usage(self, context: RunContext, events: EventBus, usage: TokenUsage) -> None:
        context.usage = context.usage.plus(usage)
        await events.emit("usage", context.usage.model_dump(mode="json", by_alias=True))

    async def _transition(
        self,
        context: RunContext,
        events: EventBus,
        machine: RunStateMachine,
        chain: MiddlewareChain,
        target: RunState,
    ) -> None:
        previous = machine.state
        payload = {"previousState": previous.value, "state": target.value}
        await chain.invoke(Hook.BEFORE_STATE, context, payload)
        machine.transition(target)
        context.state = target
        await events.emit("state", payload)
        await chain.invoke(Hook.AFTER_STATE, context, payload)

    async def _fail(
        self,
        context: RunContext,
        events: EventBus,
        machine: RunStateMachine,
        chain: MiddlewareChain,
    ) -> None:
        context.outcome = RunOutcome.FAILED
        if not machine.terminal:
            await self._transition(context, events, machine, chain, RunState.FAILED)
        await events.emit(
            "error",
            {
                "category": context.error_category or "INTERNAL",
                "retryable": False,
                "message": context.error_message or INTERNAL_ERROR_MESSAGE,
            },
        )
        await self._finish(context, events)

    async def _finish_short_circuit(
        self,
        context: RunContext,
        events: EventBus,
        machine: RunStateMachine,
        chain: MiddlewareChain,
        decision: MiddlewareDecision,
    ) -> None:
        context.outcome = decision.outcome or RunOutcome.FAILED
        context.error_category = decision.error_category
        context.error_message = decision.message
        if context.outcome == RunOutcome.CANCELLED:
            await self._transition(context, events, machine, chain, RunState.CANCELLED)
        elif context.outcome == RunOutcome.FAILED:
            await self._fail(context, events, machine, chain)
        else:
            await self._transition(context, events, machine, chain, RunState.COMPLETED)
            await self._finish(context, events)

    async def _finish(self, context: RunContext, events: EventBus) -> None:
        if self._view is not None:
            await events.emit(
                "trace.dependencies",
                {"dependencies": self._view.dependencies()},
            )
        await events.emit(
            "run.finished",
            {
                "state": context.state.value,
                "outcome": context.outcome.value if context.outcome else None,
                "evidence": [item.evidence_id for item in context.workspace.evidence],
                "answerNotices": context.answer_notices,
                "unfinished": context.last_hints if context.outcome == RunOutcome.FAILED else [],
                "usage": context.usage.model_dump(mode="json", by_alias=True),
            },
        )

    @staticmethod
    def _short_circuited(decision: MiddlewareDecision) -> bool:
        return decision.type == DecisionType.SHORT_CIRCUIT

    @staticmethod
    def _check_cancelled(context: RunContext) -> None:
        if context.cancelled:
            raise asyncio.CancelledError()
