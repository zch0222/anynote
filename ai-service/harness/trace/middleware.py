"""OpenTelemetry 形态的 Trace 事件中间件。

Trace 记录全文：上下文各层原文（按哈希写入 blobs）、思考、草稿、工具参数与原始结果。

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
        """构造单次运行的 Trace 中间件。

        :param events: 本次运行的事件总线
        :param view: 本次运行的过程投影，提供模型轮与工具调用的内部记录
        """
        self._events = events
        self._view = view
        self._blobs: set[str] = set()

    async def handle(self, context: MiddlewareContext) -> MiddlewareDecision:
        """按挂载点生成 Trace。

        :param context: 中间件输入
        :return: 始终放行
        """
        run = context.run
        if context.hook == Hook.AFTER_PREPARE:
            await self._events.emit(
                "trace.context",
                self._span(run.run_id, "context.build", self._context_attributes(context)),
            )
        elif context.hook == Hook.AFTER_MODEL:
            await self._events.emit(
                "trace.model",
                self._span(run.run_id, "model.call", self._model_attributes(context)),
            )
        elif context.hook == Hook.AFTER_ACT:
            await self._events.emit(
                "trace.action",
                self._span(run.run_id, "action.execute", {"actions": self._action_attributes(context)}),
            )
        elif context.hook == Hook.BEFORE_STATE:
            await self._events.emit(
                "trace.state",
                self._span(run.run_id, "state.transition", context.payload),
            )
        elif context.hook == Hook.AFTER_VERIFY:
            report = context.payload
            attributes = {
                "passed": report.passed,
                "issues": [issue.__dict__ for issue in report.issues],
                "diagnostics": report.diagnostics,
                "answerBeforeRepair": run.answer,
            }
            if report.repair_hint is not None:
                attributes["repairHint"] = report.repair_hint
            await self._events.emit("trace.verify", self._span(run.run_id, "result.verify", attributes))
        return MiddlewareDecision()

    def _context_attributes(self, context: MiddlewareContext) -> dict:
        """构造上下文清单，各层原文以哈希为键写入 blobs，同一运行内每个哈希只写一次。

        :param context: 中间件输入
        :return: span 属性
        """
        manifest = context.payload.manifest
        attributes: dict = {"manifest": manifest.model_dump(mode="json", by_alias=True)}
        blobs = []
        for entry in manifest.entries:
            if entry.content is None or entry.content_hash in self._blobs:
                continue
            self._blobs.add(entry.content_hash)
            blobs.append({"hash": entry.content_hash, "content": entry.content})
        if blobs:
            attributes["blobs"] = blobs
        return attributes

    def _model_attributes(self, context: MiddlewareContext) -> dict:
        """构造模型轮 Trace：轮次、用量（只取本轮）、模型与供应商、尝试次数、首字时间、思考与草稿。

        :param context: 中间件输入
        :return: span 属性
        """
        payload = dict(context.payload or {})
        record = self._view_turn(context.run.model_turns)
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
            if record.first_output is not None:
                payload["firstOutputMs"] = max(0, int((record.first_output - record.started) * 1000))
        return payload

    def _action_attributes(self, context: MiddlewareContext) -> list[dict]:
        """构造行动 Trace：完整参数、原始结果（超出上限截断并标注）、登记的证据编号与错误原文。

        :param context: 中间件输入
        :return: 行动条目列表
        """
        limit = context.run.runtime.trace_result_max_chars
        actions = []
        for item in context.payload or []:
            record = self._view.tool_records.get(item.call_id) if self._view is not None else None
            content = item.content
            if len(content) > limit:
                content = content[:limit] + f"\n…（截断，全文 {len(item.content)} 字）"
            entry = {
                "callId": item.call_id,
                "tool": item.tool_name,
                "status": item.status.value,
                "errorCategory": item.error_category.value if item.error_category else None,
                "durationMs": item.duration_ms,
                "diagnostics": item.diagnostics,
                "evidenceIds": list(item.evidence_ids),
                "result": content,
            }
            if record is not None:
                entry["arguments"] = record.arguments
                if record.error_message:
                    entry["errorMessage"] = record.error_message
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
