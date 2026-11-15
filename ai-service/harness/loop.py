"""五阶段 Harness 执行循环。

@author 称霸幼儿园
"""

import asyncio
import time

from agents.knowledge_retrieval.agent import AgentFinishArgs, finish_tool_definition
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
    MiddlewareDecision,
)
from harness.models import RunContext, RunOutcome, RunState, TokenUsage, ToolExchange
from harness.state import RunStateMachine
from harness.trace.middleware import TraceMiddleware
from harness.verify.framework import VerificationIssue, VerificationReport, VerifierFramework
from models.base import ChatModel
from models.catalog import ModelError


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

    async def run(self, context: RunContext, events: EventBus) -> None:
        """运行到完成、失败或取消终态。

        :param context: 单次运行状态
        :param events: 运行事件总线
        """
        machine = RunStateMachine()
        chain = MiddlewareChain(
            [
                BudgetMiddleware(),
                *self._custom_middlewares,
                NoProgressMiddleware(),
                TraceMiddleware(events),
            ],
            events=events,
        )
        signal_attempts = 0
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
                calls, turn_usage, finish_signal = await self._call_model(context, events, prepared)
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
                        if signal_attempts == 0:
                            signal_attempts += 1
                            context.hints.append("未收到结构化终态，请使用 agent_finish 提交结果。")
                            continue
                        context.error_category = "VALIDATION_FAILED"
                        context.error_message = INTERNAL_ERROR_MESSAGE
                        await self._fail(context, events, machine, chain)
                        return
                    await self._transition(context, events, machine, chain, RunState.VERIFYING)
                    decision = await chain.invoke(Hook.BEFORE_VERIFY, context)
                    if self._short_circuited(decision):
                        await self._finish_short_circuit(context, events, machine, chain, decision)
                        return
                    validated = validate_answer(
                        context.answer,
                        finish_signal,
                        context.workspace.evidence,
                        context.scope_summary,
                    )
                    base_report = self._verifier.verify(context)
                    report = VerificationReport(
                        issues=[
                            *base_report.issues,
                            *(VerificationIssue(code, code) for code in validated.issues),
                        ]
                    )
                    await chain.invoke(Hook.AFTER_VERIFY, context, report)
                    if not report.passed:
                        if context.verification_attempts == 0:
                            context.verification_attempts += 1
                            context.hints.append(
                                "引用或终态验证未通过: "
                                + ",".join(issue.code for issue in report.issues)
                            )
                            context.answer = ""
                            await self._transition(context, events, machine, chain, RunState.RUNNING)
                            continue
                        context.error_category = "VALIDATION_FAILED"
                        context.error_message = INTERNAL_ERROR_MESSAGE
                        await self._fail(context, events, machine, chain)
                        return
                    context.answer = validated.answer
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
        calls = []
        usage = TokenUsage()
        buffered_text = []
        finish_signal = None
        structured = context.agent.terminal_tool is not None
        async for chunk in self._model.stream(
            context.request.model or context.agent.main_model,
            context.model_snapshot,
            prepared.messages,
            prepared.tools,
            context.runtime,
            bool(context.request.scope or context.workspace.evidence or context.tool_exchanges),
        ):
            self._check_cancelled(context)
            if chunk.text_delta:
                if structured:
                    buffered_text.append(chunk.text_delta)
                else:
                    context.answer += chunk.text_delta
                    await events.emit("text.delta", {"delta": chunk.text_delta})
            if chunk.usage:
                usage = usage.plus(chunk.usage)
            if chunk.tool_calls:
                for call in chunk.tool_calls:
                    if structured and call.name == context.agent.terminal_tool:
                        if finish_signal is not None or calls:
                            raise ValueError("Agent finish signal must be the only terminal tool call")
                        finish_signal = AgentFinishArgs.model_validate(call.arguments)
                    else:
                        if finish_signal is not None:
                            raise ValueError("Agent finish signal cannot be combined with another tool call")
                        calls.append(call)
        if structured:
            context.answer = "".join(buffered_text) if finish_signal is not None else ""
        return calls, usage, finish_signal

    async def _act(self, context: RunContext, events: EventBus, calls):
        specs = [self._registry.get(call.name) for call in calls]
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
        await events.emit(
            "run.finished",
            {
                "state": context.state.value,
                "outcome": context.outcome.value if context.outcome else None,
                "evidence": [item.evidence_id for item in context.workspace.evidence],
                "unfinished": context.hints if context.outcome == RunOutcome.FAILED else [],
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
