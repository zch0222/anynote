"""运行过程投影（用户视图）测试。

@author 称霸幼儿园
"""

import asyncio
import math

from pydantic import BaseModel

from core.config import HarnessRuntimeSettings
from harness.action.plane import FatalActionError, ToolExecutionError
from harness.action.registry import ToolOutput, ToolRegistry, ToolSpec
from harness.events import EventBus
from harness.models import (
    ActionErrorCategory,
    AgentDefinition,
    EvidenceItem,
    ModelChunk,
    RunContext,
    RunRequest,
    ToolCall,
)
from harness.view.events import ToolCallRecord, VisibleSet
from models.catalog import ModelCatalogSnapshot
from models.scripted import ScriptedModel, ScriptStep
from tests.conftest import collect_events, make_harness, make_run

TOOL_STARTED_KEYS = {"id", "name", "summary", "target"}
TOOL_FINISHED_KEYS = {"id", "name", "status", "hitCount", "durationMs", "errorCategory", "retryable", "target", "result"}


class ToolArgs(BaseModel):
    """测试工具的宽松参数模型。"""

    ref: str | None = None
    subtype: str | None = None
    query: str | None = None
    pattern: str | None = None
    kb_id: int | None = None
    kb_ids: list[int] = []
    entity: str | None = None


def structured_agent(tools: list[str]) -> AgentDefinition:
    """构造带终止工具的 Agent 定义。

    :param tools: 可用工具名
    :return: Agent 定义
    """
    from agents.minimal.agent import load_minimal_agent

    return AgentDefinition(**{**load_minimal_agent().model_dump(), "tools": tools, "terminal_tool": "agent_finish"})


def finish_steps(answer: str = "最终回答", count: int = 2) -> list[ScriptStep]:
    """生成若干个提交回答的模型轮（校验修复时会用到第二轮）。

    :param answer: 回答正文
    :param count: 轮数
    :return: 模型脚本
    """
    return [
        ScriptStep([
            ModelChunk(
                tool_calls=[ToolCall(call_id=f"fin{index}", name="agent_finish",
                                     arguments={"outcome": "ANSWERED", "answer": answer})],
                finish=True,
            )
        ])
        for index in range(count)
    ]


def evidence(evidence_id: str, source_id: str, title: str, kb_id: int = 3, kb_name: str = "课程库") -> EvidenceItem:
    """构造一条测试证据。"""
    return EvidenceItem(
        evidence_id=evidence_id,
        source_type=source_id.split(":", 1)[0],
        source_id=source_id,
        content="正文",
        title=title,
        kb_id=kb_id,
        kb_name=kb_name,
        locator={"heading": "2.1"},
    )


def of_type(events, event_type: str):
    """按类型筛选事件。"""
    return [event for event in events if event.type == event_type]


def make_named_run(run_id: str, question: str, tools: list[str]) -> RunContext:
    """构造指定运行标识与问题的结构化运行。

    :param run_id: 运行标识
    :param question: 用户问题
    :param tools: 可用工具
    :return: 运行上下文
    """
    return RunContext(
        request=RunRequest(run_id=run_id, input=question),
        agent=structured_agent(tools),
        runtime=HarnessRuntimeSettings(),
        model_snapshot=ModelCatalogSnapshot(version="0:0"),
        access_token="secret-user-token",
    )


class RoutingModel:
    """按用户问题把调用分派到各自脚本的假模型，每个片段可带发出前的延迟。"""

    def __init__(self, scripts: dict[str, list[list[tuple[float, ModelChunk]]]]):
        self._scripts = {question: list(steps) for question, steps in scripts.items()}
        self.calls: list[dict] = []

    async def stream(self, logical_name, snapshot, messages, tools, runtime, contains_knowledge):
        """播放该问题的下一步脚本。"""
        question = next(item["content"] for item in reversed(messages) if item["role"] == "user")
        self.calls.append({"question": question, "messages": messages})
        step = self._scripts[question].pop(0)
        for delay, chunk in step:
            await asyncio.sleep(delay)
            yield chunk


async def test_concurrent_runs_on_one_harness_do_not_cross():
    """一个 Harness 上两个重叠运行：思考、过程说明、重试与依赖清单都只属于本运行。"""
    registry = ToolRegistry()

    async def slow(_args, _action):
        await asyncio.sleep(0.05)
        return ToolOutput(content="结果", evidence=[evidence("E1", "note:111", "A的笔记")])

    registry.register(ToolSpec("slow_a", "慢工具", "测试", ToolArgs, slow))
    finish_a = ModelChunk(tool_calls=[ToolCall(call_id="fa", name="agent_finish",
                                               arguments={"outcome": "ANSWERED", "answer": "A答[1]"})])
    model = RoutingModel({
        "A问题": [
            [
                (0, ModelChunk(reasoning_delta="<A用户的私密思考第0段>")),
                (0, ModelChunk(text_delta="A先查一下")),
                (0, ModelChunk(tool_calls=[ToolCall(call_id="ca", name="slow_a", arguments={"query": "a"})])),
            ],
            [
                (0, ModelChunk(reasoning_delta="<A用户的私密思考第1段>")),
                (0.03, ModelChunk(retry_attempt=2, reasoning_interrupted=True)),
                (0.03, ModelChunk(reasoning_delta="<A用户的私密思考第2段>")),
                (0.03, ModelChunk(reasoning_delta="<A用户的私密思考第3段>")),
                (0, finish_a),
            ],
        ],
        "B问题": [
            [
                (0, ModelChunk(reasoning_delta="<B第0段>")),
                (0.03, ModelChunk(reasoning_delta="<B第1段>")),
                (0.03, ModelChunk(reasoning_delta="<B第2段>")),
                (0.03, ModelChunk(reasoning_delta="<B第3段>")),
                (0, ModelChunk(text_delta="B回答")),
            ],
        ],
    })
    harness = make_harness(model, registry=registry)
    run_a = make_named_run("run-a", "A问题", ["slow_a"])
    run_b = make_named_run("run-b", "B问题", [])
    bus_a = EventBus("run-a", heartbeat_interval_s=0.01)
    bus_b = EventBus("run-b", heartbeat_interval_s=0.01)

    async def start_b():
        await asyncio.sleep(0.02)
        await harness.run(run_b, bus_b)

    await asyncio.gather(harness.run(run_a, bus_a), start_b())
    await bus_a.close()
    await bus_b.close()
    events_a = [event async for event in bus_a.events()]
    events_b = [event async for event in bus_b.events()]

    text_a = "".join(event.data["delta"] for event in of_type(events_a, "reasoning.delta"))
    text_b = "".join(event.data["delta"] for event in of_type(events_b, "reasoning.delta"))
    assert "A用户" in text_a and "<B" not in text_a
    assert "<B" in text_b and "A用户" not in text_b
    blocks_a = {event.data["id"] for event in of_type(events_a, "reasoning.delta")}
    assert {event.data["id"] for event in of_type(events_a, "reasoning.finished")} == blocks_a
    assert all("A" in event.data["text"] for event in of_type(events_a, "step.note"))
    assert len(of_type(events_a, "step.note")) == 1
    assert not of_type(events_b, "step.note")
    assert len(of_type(events_a, "model.retry")) == 1
    assert not of_type(events_b, "model.retry")
    assert of_type(events_a, "trace.dependencies")[0].data["dependencies"] == ["note:111"]
    assert of_type(events_b, "trace.dependencies")[0].data["dependencies"] == []
    reasoning_a = "".join(event.data["attributes"]["reasoning"] for event in of_type(events_a, "trace.model"))
    reasoning_b = "".join(event.data["attributes"]["reasoning"] for event in of_type(events_b, "trace.model"))
    assert "A用户" in reasoning_a and "<B" not in reasoning_a
    assert "<B" in reasoning_b and "A用户" not in reasoning_b


async def test_reasoning_batches_concatenate_to_full_text(monkeypatch):
    """冻结时钟下，同一块的增量按序拼接等于全文，条数不超过 ⌈字数 ÷ 阈值⌉ + 1。"""
    import harness.view.middleware as view_module

    monkeypatch.setattr(view_module, "_now", lambda: 1000.0)
    deltas = ["思", "考一", "下吧", "长" * 70, "a", "bc", "d", "ef", "长" * 80, "g", "hi"]
    model = ScriptedModel([
        ScriptStep([*(ModelChunk(reasoning_delta=delta) for delta in deltas),
                    ModelChunk(text_delta="答案", finish=True)])
    ])
    events = await collect_events(make_harness(model), make_run())
    sent = of_type(events, "reasoning.delta")
    full = "".join(deltas)
    assert "".join(event.data["delta"] for event in sent) == full
    threshold = HarnessRuntimeSettings().reasoning_batch_chars
    assert len(sent) <= math.ceil(len(full) / threshold) + 1
    finished = of_type(events, "reasoning.finished")
    assert len(finished) == 1
    assert finished[0].seq > sent[-1].seq


async def test_interrupted_block_flushes_all_text_before_finished():
    """重试中断时，interrupted 结束事件之前已发出该块的全部已产出文本。"""
    model = ScriptedModel([
        ScriptStep([
            ModelChunk(reasoning_delta="先想"),
            ModelChunk(reasoning_delta="一半"),
            ModelChunk(retry_attempt=2, reasoning_interrupted=True),
            ModelChunk(reasoning_delta="重来"),
            ModelChunk(text_delta="答案", finish=True),
        ])
    ])
    events = await collect_events(make_harness(model), make_run())
    interrupted = next(event for event in events
                       if event.type == "reasoning.finished" and event.data["status"] == "interrupted")
    block_text = "".join(
        event.data["delta"] for event in events
        if event.type == "reasoning.delta" and event.data["id"] == interrupted.data["id"]
        and event.seq < interrupted.seq
    )
    assert block_text == "先想一半"
    assert len(of_type(events, "model.retry")) == 1


async def test_tool_results_belong_to_their_own_call():
    """三次顺序检索加一轮并行调用：结果条目、计数与证据编号按调用各自归属，零命中为 0。"""
    registry = ToolRegistry()
    returned = {
        "期末复习提纲": [evidence("E1", "note:1", "笔记一")],
        "数据结构第三章": [evidence("E2", "note:2", "笔记二")],
        "完全无关的冷门话题": [],
        "图论": [evidence("E3", "note:3", "笔记三")],
        "动态规划例题与解析": [evidence("E4", "note:4", "笔记四")],
    }

    async def search(args, _action):
        return ToolOutput(content="结果", evidence=returned[args.query])

    registry.register(ToolSpec("kb_search", "检索知识库", "测试", ToolArgs, search))

    def call(call_id: str, query: str) -> ToolCall:
        return ToolCall(call_id=call_id, name="kb_search", arguments={"query": query})

    model = ScriptedModel([
        ScriptStep([ModelChunk(tool_calls=[call("c1", "期末复习提纲")])]),
        ScriptStep([ModelChunk(tool_calls=[call("c2", "数据结构第三章")])]),
        ScriptStep([ModelChunk(tool_calls=[call("c4", "图论"), call("c5", "动态规划例题与解析")])]),
        ScriptStep([ModelChunk(tool_calls=[call("c3", "完全无关的冷门话题")])]),
        *finish_steps("结论[1]"),
    ])
    run = make_run()
    run.agent = structured_agent(["kb_search"])
    events = await collect_events(make_harness(model, registry), run)
    finished = {event.data["id"]: event.data for event in of_type(events, "tool.finished")}
    expected = {"c1": ["note:1"], "c2": ["note:2"], "c3": [], "c4": ["note:3"], "c5": ["note:4"]}
    for call_id, refs in expected.items():
        assert [item["ref"] for item in finished[call_id]["result"]["items"]] == refs
        assert finished[call_id]["result"]["count"] == len(refs)
        assert finished[call_id]["hitCount"] == len(refs)
    actions = {
        action["callId"]: action["evidenceIds"]
        for event in of_type(events, "trace.action")
        for action in event.data["attributes"]["actions"]
    }
    assert actions == {"c1": ["E1"], "c2": ["E2"], "c3": [], "c4": ["E3"], "c5": ["E4"]}


async def test_tool_event_fields_follow_contract():
    """工具事件始终带契约字段：开始事件带工具说明，结束事件带命中数、耗时与可重试标记。"""
    registry = ToolRegistry()

    async def search(_args, _action):
        return ToolOutput(content="结果", evidence=[evidence("E1", "note:1", "笔记一")])

    async def broken(_args, _action):
        raise ToolExecutionError(ActionErrorCategory.TRANSIENT, "暂时失败", retryable=True)

    registry.register(ToolSpec("kb_search", "检索知识库", "测试", ToolArgs, search))
    registry.register(ToolSpec("kb_list", "列出可访问的知识库", "测试", ToolArgs, broken))
    model = ScriptedModel([
        ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="c1", name="kb_search", arguments={"query": "期末"})])]),
        ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="c2", name="kb_list", arguments={})])]),
        *finish_steps("结论[1]"),
    ])
    run = make_run()
    run.agent = structured_agent(["kb_search", "kb_list"])
    events = await collect_events(make_harness(model, registry), run)
    for event in of_type(events, "tool.started"):
        assert set(event.data) == TOOL_STARTED_KEYS
    started = {event.data["id"]: event.data for event in of_type(events, "tool.started")}
    assert started["c1"]["summary"] == "检索知识库"
    assert started["c2"]["summary"] == "列出可访问的知识库"
    for event in of_type(events, "tool.finished"):
        assert set(event.data) == TOOL_FINISHED_KEYS
    finished = {event.data["id"]: event.data for event in of_type(events, "tool.finished")}
    assert finished["c1"]["hitCount"] == 1
    assert finished["c1"]["retryable"] is False
    assert finished["c2"]["status"] == "FAILED"
    assert finished["c2"]["errorCategory"] == "TRANSIENT"
    assert finished["c2"]["retryable"] is True
    assert finished["c2"]["result"] is None


async def test_unreadable_ref_read_shows_placeholder_after_failure():
    """对不可读引用调 kb_read：开始时显示「指定内容」，失败后换成「未找到或无权访问的内容」。"""
    registry = ToolRegistry()

    async def read(_args, _action):
        raise ToolExecutionError(ActionErrorCategory.NOT_FOUND, "知识内容不存在或不可读")

    registry.register(ToolSpec("kb_read", "阅读原文", "测试", ToolArgs, read))
    model = ScriptedModel([
        ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="c1", name="kb_read", arguments={"ref": "note:999"})])]),
        *finish_steps(),
    ])
    run = make_run()
    run.agent = structured_agent(["kb_read"])
    events = await collect_events(make_harness(model, registry), run)
    assert of_type(events, "tool.started")[0].data["target"] == {"label": "指定内容", "resolved": False}
    assert of_type(events, "tool.finished")[0].data["target"] == {
        "label": "未找到或无权访问的内容",
        "resolved": False,
    }


async def test_scope_knowledge_base_names_resolve_kb_refs():
    """检索范围内的知识库登记进可见集：kb 引用解析为知识库名，范围外的只显示占位。"""
    registry = ToolRegistry()

    async def outline(_args, _action):
        return ToolOutput(content="目录", diagnostics={"nodes": 2})

    registry.register(ToolSpec("kb_outline", "查看目录", "测试", ToolArgs, outline))
    model = ScriptedModel([
        ScriptStep([ModelChunk(tool_calls=[
            ToolCall(call_id="c1", name="kb_outline", arguments={"ref": "kb:3"}),
            ToolCall(call_id="c2", name="kb_outline", arguments={"ref": "kb:99"}),
        ])]),
        *finish_steps(),
    ])
    run = make_run()
    run.agent = structured_agent(["kb_outline"])
    run.scope_knowledge_bases = {3: "课程库"}
    events = await collect_events(make_harness(model, registry), run)
    started = {event.data["id"]: event.data for event in of_type(events, "tool.started")}
    assert started["c1"]["target"] == {"label": "课程库", "resolved": True}
    assert started["c2"]["target"] == {"label": "指定内容", "resolved": False}


def _visible() -> VisibleSet:
    visible = VisibleSet()
    visible.put_kb(3, "课程库")
    visible.put_kb(4, "算法库")
    visible.put_entity("note:12", "复习提纲")
    visible.put_entity("mooc_item:5#transcript", "第一讲")
    return visible


def _record(name: str, arguments: dict, status: str | None = None) -> ToolCallRecord:
    return ToolCallRecord(call_id="c1", name=name, arguments=arguments, status=status)


def test_target_label_per_tool():
    """各工具的对象标签只取可见集里的名称，不在可见集里的知识库不出现名称。"""
    from harness.view.middleware import target_label

    visible = _visible()
    assert target_label(_record("kb_list", {}), visible) is None
    assert target_label(_record("kb_outline", {"ref": "kb:3"}), visible) == {"label": "课程库", "resolved": True}
    assert target_label(_record("kb_read", {"ref": "note:12"}), visible) == {"label": "复习提纲", "resolved": True}
    assert target_label(_record("kb_read", {"ref": "mooc_item:5", "subtype": "transcript"}), visible) == {
        "label": "第一讲",
        "resolved": True,
    }
    assert target_label(_record("kb_related", {"ref": "note:7"}), visible) == {"label": "指定内容", "resolved": False}
    assert target_label(_record("kb_search", {"query": "期末复习", "kb_ids": [3, 99, 4]}), visible) == {
        "label": "期末复习 · 课程库、算法库",
        "resolved": True,
    }
    assert target_label(_record("kb_search", {"query": "期末复习", "kb_ids": [99]}), visible) == {
        "label": "期末复习",
        "resolved": True,
    }
    assert target_label(_record("kb_grep", {"pattern": "倒排", "ref": "note:12"}), visible) == {
        "label": "倒排 · 复习提纲",
        "resolved": True,
    }
    assert target_label(_record("kb_grep", {"pattern": "倒排", "kb_id": 3}), visible) == {
        "label": "倒排 · 课程库",
        "resolved": True,
    }
    assert target_label(_record("kb_grep", {"pattern": "倒排", "kb_id": 99}), visible) == {
        "label": "倒排 · 指定内容",
        "resolved": False,
    }
    assert target_label(_record("kb_grep", {"pattern": "倒排", "ref": "note:7"}, "FAILED"), visible, finished=True) == {
        "label": "倒排 · 未找到或无权访问的内容",
        "resolved": False,
    }
    assert target_label(_record("kb_query", {"entity": "note", "kb_ids": [3, 99]}), visible) == {
        "label": "笔记 · 课程库",
        "resolved": True,
    }
    assert target_label(_record("kb_query", {"entity": "transcript"}), visible) == {"label": "字幕", "resolved": True}


def test_query_entity_names_are_confirmed_labels():
    """kb_query 的实体类型映射为已确认的中文名。"""
    from harness.view.middleware import target_label

    expected = {
        "kb": "知识库", "note": "笔记", "doc": "资料", "mooc": "慕课", "mooc_item": "慕课条目",
        "transcript": "字幕", "summary": "视频总结", "task": "任务",
    }
    for entity, label in expected.items():
        assert target_label(_record("kb_query", {"entity": entity}), VisibleSet())["label"] == label


async def test_fatal_tool_error_finishes_every_started_tool():
    """工具执行中途抛不可降级错误时，每个 tool.started 都有对应的失败 tool.finished。"""
    registry = ToolRegistry()

    async def fatal(_args, _action):
        raise FatalActionError("KNOWLEDGE_ACCESS_UNAVAILABLE")

    async def slow(_args, _action):
        await asyncio.sleep(0.05)
        return ToolOutput(content="结果")

    registry.register(ToolSpec("kb_read", "阅读原文", "测试", ToolArgs, fatal))
    registry.register(ToolSpec("kb_search", "检索知识库", "测试", ToolArgs, slow))
    model = ScriptedModel([
        ScriptStep([ModelChunk(tool_calls=[
            ToolCall(call_id="c1", name="kb_read", arguments={"ref": "note:1"}),
            ToolCall(call_id="c2", name="kb_search", arguments={"query": "q"}),
        ])]),
    ])
    run = make_run()
    run.agent = structured_agent(["kb_read", "kb_search"])
    events = await collect_events(make_harness(model, registry), run)
    started = {event.data["id"] for event in of_type(events, "tool.started")}
    finished = {event.data["id"]: event.data for event in of_type(events, "tool.finished")}
    assert started == {"c1", "c2"}
    assert set(finished) == started
    assert all(item["status"] == "FAILED" for item in finished.values())
    finished_seq = max(event.seq for event in of_type(events, "tool.finished"))
    assert finished_seq < of_type(events, "run.finished")[0].seq
    assert events[-1].data["outcome"] == "FAILED"


async def test_run_finished_reports_tool_calls_and_first_output():
    """run.finished 带本次运行的工具调用次数与首字时间。"""
    registry = ToolRegistry()

    async def search(_args, _action):
        return ToolOutput(content="结果")

    registry.register(ToolSpec("kb_search", "检索知识库", "测试", ToolArgs, search))
    model = ScriptedModel([
        ScriptStep([
            ModelChunk(reasoning_delta="想一下"),
            ModelChunk(tool_calls=[
                ToolCall(call_id="c1", name="kb_search", arguments={"query": "a"}),
                ToolCall(call_id="c2", name="kb_search", arguments={"query": "b"}),
            ]),
        ]),
        *finish_steps(),
    ])
    run = make_run()
    run.agent = structured_agent(["kb_search"])
    events = await collect_events(make_harness(model, registry), run)
    finished = of_type(events, "run.finished")[0].data
    assert finished["toolCalls"] == 2
    assert isinstance(finished["firstOutputMs"], int) and finished["firstOutputMs"] >= 0


async def test_run_without_output_has_no_first_output_time():
    """运行没有任何思考或正文输出时，首字时间为空。"""
    model = ScriptedModel([ScriptStep(error=FatalActionError("KNOWLEDGE_ACCESS_UNAVAILABLE"))])
    events = await collect_events(make_harness(model), make_run())
    finished = of_type(events, "run.finished")[0].data
    assert finished["firstOutputMs"] is None
    assert finished["toolCalls"] == 0
