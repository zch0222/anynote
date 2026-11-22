"""运行过程投影中间件：维护内部事件与可见集，产出用户视图事件。

@author 称霸幼儿园
"""

import time
import uuid

from harness.action.registry import ToolRegistry
from harness.middleware import HarnessMiddleware, Hook, MiddlewareContext, MiddlewareDecision
from harness.models import ActionStatus, RunContext
from harness.view.events import (
    ModelTurnRecord,
    ReasoningBlock,
    ToolCallRecord,
    VisibleSet,
)

PENDING_TARGET = "指定内容"
UNREADABLE_TARGET = "未找到或无权访问的内容"
TARGET_SEPARATOR = " · "
NAME_SEPARATOR = "、"
QUERY_ENTITY_LABELS: dict[str, str] = {
    "kb": "知识库",
    "note": "笔记",
    "doc": "资料",
    "mooc": "慕课",
    "mooc_item": "慕课条目",
    "transcript": "字幕",
    "summary": "视频总结",
    "task": "任务",
}
TOOL_RESULT_COUNT_KEYS: dict[str, str] = {
    "kb_list": "knowledgeBases",
    "kb_outline": "nodes",
    "kb_grep": "hits",
    "kb_read": "chars",
    "kb_query": "rows",
    "kb_related": "related",
    "kb_view_doc": "pages",
}
RESULT_ITEM_LIMIT = 3


def _now() -> float:
    """返回投影使用的单调时钟。"""
    return time.monotonic()


class RunViewMiddleware(HarnessMiddleware):
    """单次运行的过程投影：在核心循环挂载点上维护过程记录并发布用户视图事件。

    @author 称霸幼儿园
    """

    def __init__(self, events, registry: ToolRegistry | None = None):
        """构造单次运行的过程投影。

        :param events: 本次运行的事件总线
        :param registry: 工具注册表，用于取已确认的工具说明
        """
        self._events = events
        self._registry = registry
        self.visible = VisibleSet()
        self.turns: list[ModelTurnRecord] = []
        self.tool_records: dict[str, ToolCallRecord] = {}
        self.first_output: float | None = None
        self._pending: dict[str, list[str]] = {}
        self._last_sent: dict[str, float] = {}
        self._open_blocks: dict[str, ReasoningBlock] = {}

    async def handle(self, context: MiddlewareContext) -> MiddlewareDecision:
        """维护过程记录并发布用户视图事件。

        :param context: 中间件输入
        :return: 始终放行
        """
        run = context.run
        if context.hook == Hook.BEFORE_RUN:
            for kb_id, name in run.scope_knowledge_bases.items():
                self.visible.put_kb(kb_id, name)
        elif context.hook == Hook.BEFORE_MODEL:
            self.turns.append(
                ModelTurnRecord(
                    turn=run.model_turns + 1,
                    logical_name=run.request.model or run.agent.main_model,
                    started=_now(),
                )
            )
        elif context.hook == Hook.AFTER_MODEL:
            self._close_turn(run, context)
        elif context.hook == Hook.BEFORE_ACT:
            for call in context.payload or []:
                record = ToolCallRecord(
                    call_id=call.call_id,
                    name=call.name,
                    arguments=dict(call.arguments),
                    started=_now(),
                )
                self.tool_records[call.call_id] = record
                await self._emit_tool_started(record)
        elif context.hook == Hook.AFTER_ACT:
            for observation in context.payload or []:
                record = self.tool_records.get(observation.call_id)
                if record is None:
                    continue
                self._finish_record(run, record, observation)
                await self._emit_tool_finished(record)
        return MiddlewareDecision()

    async def note_reasoning(self, run: RunContext, block: ReasoningBlock, delta: str) -> None:
        """记录思考增量，缓冲达到字数或时间阈值时把整段缓冲作为一条增量发出。

        :param run: 当前运行
        :param block: 所属思考块
        :param delta: 思考增量
        """
        now = _now()
        self.note_output(run.model_turns, now)
        record = self._turn(run.model_turns)
        if record is not None and block not in record.reasoning_blocks:
            record.reasoning_blocks.append(block)
        if block.block_id not in self._open_blocks:
            self._open_blocks[block.block_id] = block
            self._last_sent[block.block_id] = now
        block.append(delta, now)
        pending = self._pending.setdefault(block.block_id, [])
        pending.append(delta)
        due = (
            sum(len(item) for item in pending) >= run.runtime.reasoning_batch_chars
            or (now - self._last_sent[block.block_id]) * 1000 >= run.runtime.reasoning_batch_interval_ms
        )
        if due:
            await self._flush_block(block.block_id, now)

    async def finish_reasoning_block(self, block: ReasoningBlock, status: str = "done") -> None:
        """发完该块的待发缓冲后结束思考块。

        :param block: 思考块
        :param status: done 或 interrupted
        """
        now = _now()
        await self._flush_block(block.block_id, now)
        block.close(now, status)
        self._open_blocks.pop(block.block_id, None)
        self._last_sent.pop(block.block_id, None)
        await self._events.emit("reasoning.finished", {
            "id": block.block_id,
            "durationMs": block.duration_ms,
            "status": status,
        })

    async def mark_retry(self, attempt: int) -> None:
        """发布一次模型重试（已输出的思考因重试而中断）。

        :param attempt: 即将开始的尝试序号
        """
        await self._flush_all(_now())
        await self._events.emit("model.retry", {"id": uuid.uuid4().hex[:16], "attempt": attempt})

    def record_attempt(self, turn: int, attempt: int) -> None:
        """记录模型轮的尝试次数。

        :param turn: 模型轮次
        :param attempt: 即将开始的尝试序号
        """
        record = self._turn(turn)
        if record is not None:
            record.attempts = max(record.attempts, attempt)

    def note_output(self, turn: int, now: float | None = None) -> None:
        """记录模型轮与整次运行的首个输出时间（思考或正文增量）。

        :param turn: 模型轮次
        :param now: 当前单调时钟，缺省时取当前时间
        """
        moment = _now() if now is None else now
        if self.first_output is None:
            self.first_output = moment
        record = self._turn(turn)
        if record is not None and record.first_output is None:
            record.first_output = moment

    async def note_step(self, turn: int, text: str) -> None:
        """记录工具轮的过程说明并整段发布。

        :param turn: 所属模型轮
        :param text: 模型写的文字
        """
        if not text.strip():
            return
        record = self._turn(turn)
        if record is not None:
            record.step_note = text
        await self._flush_all(_now())
        await self._events.emit("step.note", {"id": uuid.uuid4().hex[:16], "text": text})

    def reasoning_text(self, turn: int) -> str:
        """返回模型轮的思考全文。

        :param turn: 模型轮次
        :return: 思考全文，没有思考时为空串
        """
        record = self._turn(turn)
        return record.reasoning_text if record is not None else ""

    async def close(self, run: RunContext) -> None:
        """运行收尾：发完所有待发思考缓冲，为未结束的工具调用补发失败结束事件。

        :param run: 当前运行
        """
        await self._flush_all(_now())
        for record in self.tool_records.values():
            if record.status is not None:
                continue
            record.status = ActionStatus.FAILED.value
            record.duration_ms = int((_now() - record.started) * 1000)
            await self._emit_tool_finished(record)

    def dependencies(self, run: RunContext) -> list[str]:
        """返回本次运行工作区里全部证据的实体键，按登记顺序去重。

        :param run: 当前运行
        :return: 实体键列表，如 note:12、mooc_item:5#transcript
        """
        return list(dict.fromkeys(item.source_id for item in run.workspace.evidence))

    def first_output_ms(self, run: RunContext) -> int | None:
        """返回从运行开始到首个思考或正文增量的毫秒数。

        :param run: 当前运行
        :return: 毫秒数，没有任何输出时为空
        """
        if self.first_output is None:
            return None
        return max(0, int((self.first_output - run.monotonic_started) * 1000))

    def _finish_record(self, run: RunContext, record: ToolCallRecord, observation) -> None:
        """用观察结果补全工具调用记录，并把本次调用登记的证据加入可见集。"""
        record.status = observation.status.value
        record.duration_ms = observation.duration_ms
        record.error_category = observation.error_category.value if observation.error_category else None
        record.retryable = observation.retryable
        record.content = observation.content
        record.diagnostics = dict(observation.diagnostics)
        if observation.status == ActionStatus.FAILED:
            record.error_message = observation.content or None
        workspace = {item.evidence_id: item for item in run.workspace.evidence}
        record.evidence = [workspace[evidence_id] for evidence_id in observation.evidence_ids
                           if evidence_id in workspace]
        for item in record.evidence:
            self.visible.put_entity(item.source_id, item.title, item.locator)
            self.visible.put_kb(item.kb_id, item.kb_name)

    async def _flush_block(self, block_id: str, now: float) -> None:
        """把一个思考块的待发缓冲整体作为一条增量发出。"""
        pending = self._pending.pop(block_id, None)
        if not pending:
            return
        self._last_sent[block_id] = now
        await self._events.emit("reasoning.delta", {"id": block_id, "delta": "".join(pending)})

    async def _flush_all(self, now: float) -> None:
        """发完所有思考块的待发缓冲。"""
        for block_id in list(self._pending):
            await self._flush_block(block_id, now)

    def _close_turn(self, run: RunContext, context: MiddlewareContext) -> None:
        record = self.turns[-1] if self.turns else None
        if record is None:
            return
        payload = context.payload or {}
        record.finished = _now()
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

    async def _emit_tool_started(self, record: ToolCallRecord) -> None:
        await self._flush_all(_now())
        spec = self._registry.get(record.name) if self._registry is not None else None
        await self._events.emit("tool.started", {
            "id": record.call_id,
            "name": record.name,
            "summary": spec.summary if spec is not None else record.name,
            "target": target_label(record, self.visible),
        })

    async def _emit_tool_finished(self, record: ToolCallRecord) -> None:
        await self._events.emit("tool.finished", {
            "id": record.call_id,
            "name": record.name,
            "status": record.status,
            "hitCount": len(record.evidence),
            "durationMs": record.duration_ms,
            "errorCategory": record.error_category,
            "retryable": record.retryable,
            "target": target_label(record, self.visible, finished=True),
            "result": result_summary(record, self.visible),
        })


def target_label(record: ToolCallRecord, visible: VisibleSet, finished: bool = False) -> dict[str, object] | None:
    """从工具参数生成用户视图的对象标签，名称只取自可见集。

    对象名称取不到时，工具结束前显示「指定内容」，失败结束后显示「未找到或无权访问的内容」。

    :param record: 工具调用记录
    :param visible: 可见集
    :param finished: 工具是否已结束
    :return: target 结构，没有对象的工具为 None
    """
    arguments = record.arguments
    failed = finished and record.status == ActionStatus.FAILED.value
    placeholder = UNREADABLE_TARGET if failed else PENDING_TARGET
    name = record.name
    if name == "kb_list":
        return None
    if name == "kb_search":
        query = _text(arguments.get("query"))
        if query is None:
            return None
        names = _kb_names(arguments.get("kb_ids"), visible)
        return _label([query, NAME_SEPARATOR.join(names)] if names else [query], True)
    if name == "kb_query":
        entity = _text(arguments.get("entity"))
        if entity is None:
            return None
        names = _kb_names(arguments.get("kb_ids"), visible)
        parts = [QUERY_ENTITY_LABELS.get(entity, entity)]
        if names:
            parts.append(NAME_SEPARATOR.join(names))
        return _label(parts, True)
    if name == "kb_grep":
        pattern = _text(arguments.get("pattern"))
        object_name = _object_name(arguments, visible)
        has_object = _text(arguments.get("ref")) is not None or isinstance(arguments.get("kb_id"), int)
        if pattern is None:
            return None
        if not has_object:
            return _label([pattern], True)
        return _label([pattern, object_name or placeholder], object_name is not None)
    if _text(arguments.get("ref")) is not None:
        object_name = _object_name(arguments, visible)
        return _label([object_name or placeholder], object_name is not None)
    generic = _text(arguments.get("query")) or _text(arguments.get("pattern"))
    return _label([generic], True) if generic is not None else None


def result_summary(record: ToolCallRecord, visible: VisibleSet) -> dict[str, object] | None:
    """生成工具结果摘要：计数与本次调用登记的前 3 个证据条目。

    :param record: 工具调用记录
    :param visible: 可见集
    :return: result 结构，失败的调用为 None
    """
    if record.status == ActionStatus.FAILED.value:
        return None
    items = []
    for item in record.evidence[:RESULT_ITEM_LIMIT]:
        entry: dict[str, object] = {
            "ref": item.source_id,
            "title": item.title,
            "kbName": visible.kb_name_of(item.kb_id),
            "kbId": item.kb_id,
        }
        if item.locator:
            entry["locator"] = item.locator
        items.append(entry)
    count = _result_count(record)
    return {"count": len(record.evidence) if count is None else count, "items": items}


def _result_count(record: ToolCallRecord) -> int | None:
    """从工具诊断取结果计数。

    :param record: 工具调用记录
    :return: 计数值，工具未声明计数时为 None
    """
    key = TOOL_RESULT_COUNT_KEYS.get(record.name)
    if key is not None:
        value = record.diagnostics.get(key)
        if isinstance(value, int) and value >= 0:
            return value
    return None


def _object_name(arguments: dict, visible: VisibleSet) -> str | None:
    """按引用或知识库标识从可见集取对象名称。"""
    ref = _text(arguments.get("ref"))
    if ref is not None:
        if ref.startswith("kb:"):
            return visible.kb_name_of(_ref_id(ref))
        return visible.title_of(_item_key(ref, arguments.get("subtype")))
    kb_id = arguments.get("kb_id")
    return visible.kb_name_of(kb_id) if isinstance(kb_id, int) else None


def _kb_names(kb_ids: object, visible: VisibleSet) -> list[str]:
    """返回知识库标识中位于可见集里的名称，按参数顺序去重。"""
    if not isinstance(kb_ids, list):
        return []
    names = [visible.kb_name_of(kb_id) for kb_id in kb_ids if isinstance(kb_id, int)]
    return list(dict.fromkeys(name for name in names if name))


def _label(parts: list[str], resolved: bool) -> dict[str, object]:
    return {"label": TARGET_SEPARATOR.join(parts), "resolved": resolved}


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _ref_id(ref: str) -> int | None:
    value = ref.split(":", 1)[1]
    return int(value) if value.isdigit() else None


def _item_key(ref: str, subtype: object) -> str:
    """构造与证据 source_id 同构的实体键。

    :param ref: 基础引用
    :param subtype: 附属类型
    :return: 实体键
    """
    return f"{ref}#{subtype}" if isinstance(subtype, str) and subtype else ref
