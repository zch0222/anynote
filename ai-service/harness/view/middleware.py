"""运行过程投影中间件：维护内部事件与可见集，产出用户视图事件。

@author 称霸幼儿园
"""

import time
import uuid

from harness.middleware import HarnessMiddleware, Hook, MiddlewareContext, MiddlewareDecision
from harness.models import ActionStatus, RunContext
from harness.view.events import (
    ModelTurnRecord,
    ReasoningBlock,
    ToolCallRecord,
    VisibleSet,
)

RETRY_EVENT_ATTEMPT_LABEL = {1: 1, 2: 2}


class RunViewMiddleware(HarnessMiddleware):
    """在核心循环挂载点上维护过程记录并发布用户视图事件。

    @author 称霸幼儿园
    """

    def __init__(self, events):
        self._events = events
        self.visible = VisibleSet()
        self.turns: list[ModelTurnRecord] = []
        self.tool_records: dict[str, ToolCallRecord] = {}
        self.retry_attempts: list[int] = []

    async def handle(self, context: MiddlewareContext) -> MiddlewareDecision:
        """维护过程记录并按开关发布用户视图事件。

        :param context: 中间件输入
        :return: 始终放行
        """
        run = context.run
        runtime = run.runtime
        if context.hook == Hook.BEFORE_MODEL:
            record = ModelTurnRecord(
                turn=run.model_turns + 1,
                logical_name=run.request.model or run.agent.main_model,
                started=time.monotonic(),
            )
            self.turns.append(record)
        elif context.hook == Hook.AFTER_MODEL:
            self._close_turn(run, context)
        elif context.hook == Hook.BEFORE_ACT:
            for call in context.payload or []:
                self.tool_records[call.call_id] = ToolCallRecord(
                    call_id=call.call_id,
                    name=call.name,
                    arguments=dict(call.arguments),
                    started=time.monotonic(),
                )
                await self._emit_tool_started(run, self.tool_records[call.call_id])
        elif context.hook == Hook.AFTER_ACT:
            for observation in context.payload or []:
                record = self.tool_records.get(observation.call_id)
                if record is None:
                    continue
                record.status = observation.status.value
                record.duration_ms = observation.duration_ms
                record.error_category = (
                    observation.error_category.value if observation.error_category else None
                )
                record.content = observation.content
                record.diagnostics = dict(observation.diagnostics)
                for item in run.workspace.evidence:
                    if item.evidence_id and _owned_by(observation.call_id, item):
                        record.evidence.append(item)
                        self._mark_visible(item)
                await self._emit_tool_finished(run, record)
        return MiddlewareDecision()

    async def note_reasoning(
        self,
        run: RunContext,
        turn: int,
        delta: str,
        block: ReasoningBlock,
        first: bool,
    ) -> None:
        """记录思考增量并按合并阈值发布用户视图事件。

        :param run: 当前运行
        :param turn: 所属模型轮
        :param delta: 思考增量
        :param block: 思考块
        :param first: 是否为该块首个增量
        """
        record = self._turn(turn)
        if record is not None and block not in record.reasoning_blocks:
            record.reasoning_blocks.append(block)
        block.append(delta, time.monotonic())
        if not run.runtime.reasoning_view_enabled:
            return
        buffered = self._reasoning_buffers.get(block.block_id)
        if buffered is None:
            buffered = {"chars": 0, "last": time.monotonic()}
            self._reasoning_buffers[block.block_id] = buffered
        buffered["chars"] += len(delta)
        now = time.monotonic()
        due = (
            buffered["chars"] >= run.runtime.reasoning_batch_chars
            or (now - buffered["last"]) * 1000 >= run.runtime.reasoning_batch_interval_ms
        )
        if first and block.status == "streaming" and _starts_new_block(block):
            await self._events.emit("reasoning.delta", {
                "blockId": block.block_id,
                "delta": delta,
            })
            buffered["chars"] = 0
            buffered["last"] = now
            return
        if due:
            await self._events.emit("reasoning.delta", {
                "blockId": block.block_id,
                "delta": delta,
            })
            buffered["chars"] = 0
            buffered["last"] = now

    async def finish_reasoning_block(self, run: RunContext, block: ReasoningBlock) -> None:
        """结束思考块并发布结束事件。

        :param run: 当前运行
        :param block: 思考块
        """
        block.close(time.monotonic(), "done")
        if not run.runtime.reasoning_view_enabled:
            return
        await self._events.emit("reasoning.finished", {
            "blockId": block.block_id,
            "durationMs": block.duration_ms,
            "status": "done",
        })

    async def mark_retry(self, run: RunContext) -> None:
        """记录一次模型重试并发布事件。

        :param run: 当前运行
        """
        attempt = RETRY_EVENT_ATTEMPT_LABEL.get(len(self.retry_attempts) + 1, len(self.retry_attempts) + 1)
        self.retry_attempts.append(attempt)
        if not run.runtime.reasoning_view_enabled:
            return
        await self._events.emit("model.retry", {"attempt": attempt})

    async def note_step(self, run: RunContext, turn: int, text: str) -> None:
        """记录工具轮的过程说明并按开关发布。

        :param run: 当前运行
        :param turn: 所属模型轮
        :param text: 模型写的文字
        """
        if not text.strip():
            return
        record = self._turn(turn)
        if record is not None:
            record.step_note = text
        if not run.runtime.step_note_enabled:
            return
        await self._events.emit("step.note", {"noteId": uuid.uuid4().hex[:16], "text": text})

    def dependencies(self) -> list[str]:
        """返回本次运行模型看到过的全部条目键（含结构化行）。"""
        keys: list[str] = []
        seen: set[str] = set()
        for record in self.tool_records.values():
            for item in record.evidence:
                if item.source_id not in seen:
                    seen.add(item.source_id)
                    keys.append(item.source_id)
        return keys

    def _close_turn(self, run: RunContext, context: MiddlewareContext) -> None:
        record = self.turns[-1] if self.turns else None
        if record is None:
            return
        payload = context.payload or {}
        record.finished = time.monotonic()
        record.draft = run.answer
        record.end_reason = "tool_calls" if payload.get("toolCalls") else "finish"
        mapping = run.model_snapshot.logical_models.get(record.logical_name)
        if mapping is not None:
            record.model = mapping.model
            record.provider = mapping.provider

    def _turn(self, turn: int) -> ModelTurnRecord | None:
        for record in self.turns:
            if record.turn == turn:
                return record
        return None

    def _mark_visible(self, item) -> None:
        self.visible.put_entity(item.source_id, item.title, item.locator)
        if item.kb_id is not None and item.kb_name:
            self.visible.put_kb(item.kb_id, item.kb_name)

    async def _emit_tool_started(self, run: RunContext, record: ToolCallRecord) -> None:
        data = {
            "callId": record.call_id,
            "name": record.name,
        }
        target = _target_label(record, self.visible)
        if target is not None:
            data["target"] = target
        await self._events.emit("tool.started", data)

    async def _emit_tool_finished(self, run: RunContext, record: ToolCallRecord) -> None:
        data = {
            "callId": record.call_id,
            "name": record.name,
            "status": record.status or ActionStatus.FAILED.value,
            "durationMs": record.duration_ms,
        }
        if record.error_category is not None:
            data["errorCategory"] = record.error_category
        result = _result_summary(record, self.visible)
        if result is not None:
            data["result"] = result
        target = _target_label(record, self.visible)
        if target is not None:
            data["target"] = target
        await self._events.emit("tool.finished", data)

    @property
    def _reasoning_buffers(self) -> dict[str, dict]:
        return self.__dict__.setdefault("_buffers", {})


def _starts_new_block(block: ReasoningBlock) -> bool:
    """返回思考块是否刚开流（用于首个增量立即透出）。"""
    return len(block.text) == 1


def _owned_by(call_id: str, item) -> bool:
    """证据归属的宽松判定：同轮登记的证据都视为该轮工具产出。

    :param call_id: 工具调用标识
    :param item: 证据条目
    :return: 是否归属
    """
    return bool(call_id) and bool(item.evidence_id)


def _target_label(record: ToolCallRecord, visible: VisibleSet) -> dict[str, object] | None:
    """从工具参数解析用户视图的对象标签。

    只从可见集取名称；按引用读取的对象执行前还未经 gate，先用固定占位。

    :param record: 工具调用记录
    :param visible: 可见集
    :return: target 结构或 None
    """
    ref = record.arguments.get("ref")
    if isinstance(ref, str) and ref:
        title = visible.title_of(_item_key(ref, record.arguments.get("subtype")))
        if title:
            return {"label": title, "resolved": True}
        return {"label": "指定内容", "resolved": False}
    query = record.arguments.get("query") or record.arguments.get("pattern")
    if isinstance(query, str) and query:
        return {"label": query, "resolved": True}
    kb_id = record.arguments.get("kb_id")
    if isinstance(kb_id, int):
        name = visible.kb_name_of(kb_id)
        if name:
            return {"label": name, "resolved": True}
    entity = record.arguments.get("entity")
    if isinstance(entity, str) and entity:
        return {"label": entity, "resolved": True}
    return None


def _item_key(ref: str, subtype: object) -> str:
    """构造与证据 source_id 同构的实体键。

    :param ref: 基础引用
    :param subtype: 附属类型
    :return: 实体键
    """
    return f"{ref}#{subtype}" if isinstance(subtype, str) and subtype else ref


TOOL_RESULT_COUNT_KEYS: dict[str, str] = {
    "kb_list": "knowledgeBases",
    "kb_outline": "nodes",
    "kb_grep": "hits",
    "kb_read": "chars",
    "kb_query": "rows",
    "kb_related": "related",
}


def _result_count(record: ToolCallRecord) -> int | None:
    """从工具诊断取结果计数，取不到时回退证据条数。

    :param record: 工具调用记录
    :return: 计数值，无可用计数时为 None
    """
    key = TOOL_RESULT_COUNT_KEYS.get(record.name)
    if key is not None:
        value = record.diagnostics.get(key)
        if isinstance(value, int) and value >= 0:
            return value
    return None


def _result_summary(record: ToolCallRecord, visible: VisibleSet) -> dict[str, object] | None:
    """生成工具结果摘要：命中数与前 3 个可见条目。

    :param record: 工具调用记录
    :param visible: 可见集
    :return: result 结构或 None
    """
    if record.status == ActionStatus.FAILED.value:
        return None
    items = []
    for item in record.evidence[:3]:
        entry = {
            "ref": item.source_id,
            "title": item.title,
            "kbName": visible.kb_name_of(item.kb_id),
        }
        if item.locator:
            entry["locator"] = item.locator
        items.append(entry)
    count = _result_count(record)
    if count is None:
        count = len(record.evidence)
    result: dict[str, object] = {"count": count, "items": items}
    return result
