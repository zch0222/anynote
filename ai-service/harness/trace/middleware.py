"""OpenTelemetry 形态的 Trace 事件中间件。

开关开启时补充全文（思考、草稿、工具参数与原始结果）；关闭时维持现状字段。

@author 称霸幼儿园
"""

import time
import uuid

from harness.events import EventBus
from harness.middleware import HarnessMiddleware, Hook, MiddlewareContext, MiddlewareDecision


class TraceMiddleware(HarnessMiddleware):
    """输出不含凭据的 Trace 事件。

    @author 称霸幼儿园
    """

    def __init__(self, events: EventBus, view=None):
        self._events = events
        self._view = view
        self._blobs: dict[str, str] = {}

    async def handle(self, context: MiddlewareContext) -> MiddlewareDecision:
        """按挂载点生成 Trace。

        :param context: 中间件输入
        :return: 始终放行
        """
        run = context.run
        fulltext = run.runtime.trace_fulltext_enabled
        if context.hook == Hook.AFTER_PREPARE:
            await self._events.emit(
                "trace.context",
                self._span(
                    run.run_id,
                    "context.build",
                    self._context_attributes(context, fulltext),
                ),
            )
        elif context.hook == Hook.AFTER_MODEL:
            await self._events.emit(
                "trace.model",
                self._span(run.run_id, "model.call", self._model_attributes(context, fulltext)),
            )
        elif context.hook == Hook.AFTER_ACT:
            await self._events.emit(
                "trace.action",
                self._span(
                    run.run_id,
                    "action.execute",
                    {"actions": self._action_attributes(context, fulltext)},
                ),
            )
        elif context.hook == Hook.BEFORE_STATE:
            await self._events.emit(
                "trace.state",
                self._span(run.run_id, "state.transition", context.payload),
            )
        elif context.hook == Hook.AFTER_VERIFY:
            report = context.payload
            await self._events.emit(
                "trace.verify",
                self._span(
                    run.run_id,
                    "result.verify",
                    {
                        "passed": report.passed,
                        "issues": [issue.__dict__ for issue in report.issues],
                        "diagnostics": report.diagnostics,
                        **({"repairHint": run.hints[-1]} if fulltext and run.hints else {}),
                        **({"answerBeforeRepair": run.answer} if fulltext else {}),
                    },
                ),
            )
        return MiddlewareDecision()

    def _context_attributes(self, context: MiddlewareContext, fulltext: bool) -> dict:
        """构造上下文清单，开启全文时按哈希键补写层原文。

        :param context: 中间件输入
        :param fulltext: 是否开启全文 Trace
        :return: span 属性
        """
        manifest = context.payload.manifest.model_dump(mode="json", by_alias=True)
        attributes = {"manifest": manifest}
        if not fulltext:
            return attributes
        blobs = []
        for entry in manifest.get("entries", []):
            content = entry.pop("content", None)
            digest = entry.get("contentHash")
            if content is None or digest is None or digest in self._blobs:
                continue
            self._blobs[digest] = content
            blobs.append({"hash": digest, "content": content})
        if blobs:
            attributes["blobs"] = blobs
        return attributes

    def _model_attributes(self, context: MiddlewareContext, fulltext: bool) -> dict:
        """构造模型轮 Trace，开启全文时补思考与草稿。

        :param context: 中间件输入
        :param fulltext: 是否开启全文 Trace
        :return: span 属性
        """
        payload = dict(context.payload or {})
        if not fulltext:
            return payload
        record = self._view_turn(context.run.model_turns) if self._view is not None else None
        if record is not None:
            payload["model"] = record.model or record.logical_name
            payload["provider"] = record.provider
            payload["attempts"] = record.attempts
            payload["durationMs"] = record.duration_ms
            payload["endReason"] = record.end_reason
            payload["reasoning"] = record.reasoning_text
            payload["draft"] = record.draft
            if record.step_note:
                payload["stepNote"] = record.step_note
            first = record.first_output
            if first is not None:
                payload["firstOutputMs"] = int((first - record.started) * 1000)
        usage = payload.get("usage") or {}
        if usage.get("reasoningTokens") is None and context.run.usage.reasoning_tokens:
            usage = {**usage, "reasoningTokens": context.run.usage.reasoning_tokens}
            payload["usage"] = usage
        return payload

    def _action_attributes(self, context: MiddlewareContext, fulltext: bool) -> list[dict]:
        """构造行动 Trace，开启全文时补完整参数与原始结果。

        :param context: 中间件输入
        :param fulltext: 是否开启全文 Trace
        :return: 行动条目列表
        """
        limit = context.run.runtime.trace_result_max_chars
        actions = []
        for item in context.payload or []:
            entry = {
                "callId": item.call_id,
                "tool": item.tool_name,
                "status": item.status.value,
                "errorCategory": item.error_category.value if item.error_category else None,
                "durationMs": item.duration_ms,
                "diagnostics": item.diagnostics,
            }
            record = (
                self._view.tool_records.get(item.call_id) if self._view is not None else None
            )
            if record is not None:
                entry["evidenceIds"] = [e.evidence_id for e in record.evidence]
                if record.error_message:
                    entry["errorMessage"] = record.error_message
            if fulltext:
                if record is not None:
                    entry["arguments"] = record.arguments
                content = item.content
                if len(content) > limit:
                    content = content[:limit] + f"\n…（截断，全文 {len(item.content)} 字）"
                entry["result"] = content
            actions.append(entry)
        return actions

    def _view_turn(self, turn: int):
        """返回过程记录中对应模型轮。

        :param turn: 模型轮次
        :return: 轮记录或 None
        """
        if self._view is None:
            return None
        for record in self._view.turns:
            if record.turn == turn:
                return record
        return None

    @staticmethod
    def _span(trace_id: str, name: str, attributes) -> dict:
        return {
            "traceId": trace_id,
            "spanId": uuid.uuid4().hex[:16],
            "name": name,
            "endTimeUnixNano": time.time_ns(),
            "attributes": attributes,
        }
