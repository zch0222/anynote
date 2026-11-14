"""OpenTelemetry 形态的 Trace 事件中间件。

@author 称霸幼儿园
"""

import time
import uuid

from harness.events import EventBus
from harness.middleware import HarnessMiddleware, Hook, MiddlewareContext, MiddlewareDecision


class TraceMiddleware(HarnessMiddleware):
    """输出不含正文和凭据的 Trace 事件。

    @author 称霸幼儿园
    """

    def __init__(self, events: EventBus):
        self._events = events

    async def handle(self, context: MiddlewareContext) -> MiddlewareDecision:
        """按挂载点生成 Trace。

        :param context: 中间件输入
        :return: 始终放行
        """
        run = context.run
        if context.hook == Hook.AFTER_PREPARE:
            await self._events.emit(
                "trace.context",
                self._span(
                    run.run_id,
                    "context.build",
                    {"manifest": context.payload.manifest.model_dump(mode="json", by_alias=True)},
                ),
            )
        elif context.hook == Hook.AFTER_MODEL:
            await self._events.emit(
                "trace.model",
                self._span(run.run_id, "model.call", context.payload),
            )
        elif context.hook == Hook.AFTER_ACT:
            actions = [
                {
                    "callId": item.call_id,
                    "tool": item.tool_name,
                    "status": item.status.value,
                    "errorCategory": item.error_category.value if item.error_category else None,
                    "durationMs": item.duration_ms,
                }
                for item in context.payload or []
            ]
            await self._events.emit(
                "trace.action",
                self._span(run.run_id, "action.execute", {"actions": actions}),
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
                    },
                ),
            )
        return MiddlewareDecision()

    @staticmethod
    def _span(trace_id: str, name: str, attributes) -> dict:
        return {
            "traceId": trace_id,
            "spanId": uuid.uuid4().hex[:16],
            "name": name,
            "endTimeUnixNano": time.time_ns(),
            "attributes": attributes,
        }
