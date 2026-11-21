"""五阶段循环确定性测试。

@author 称霸幼儿园
"""

import asyncio

from core.config import HarnessRuntimeSettings
from harness.action.registry import ToolOutput, ToolRegistry, ToolSpec
from harness.events import EventBus
from harness.models import ModelChunk, RunOutcome, RunState, TokenUsage, ToolCall
from models.scripted import ScriptedModel, ScriptStep
from tests.conftest import collect_events, make_harness, make_run
from tests.test_action import SearchArgs


def visible(events):
    return [event for event in events if not event.type.startswith("trace.")]


async def test_normal_completion_emits_ordered_events_and_usage():
    """正常完成产生文本、状态、用量和完成事件。"""
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(text_delta="你好"),
                    ModelChunk(
                        text_delta="，世界",
                        usage=TokenUsage(prompt_tokens=4, completion_tokens=2, total_tokens=6, known=True),
                        finish=True,
                    ),
                ]
            )
        ]
    )
    run = make_run()
    all_events = await collect_events(make_harness(model), run)
    assert [event.seq for event in all_events] == list(range(1, len(all_events) + 1))
    events = visible(all_events)
    assert [event.type for event in events] == [
        "run.started",
        "state",
        "text.delta",
        "text.delta",
        "usage",
        "state",
        "state",
        "run.finished",
    ]
    assert run.state == RunState.COMPLETED
    assert run.outcome == RunOutcome.ANSWERED
    assert run.answer == "你好，世界"
    assert run.usage.total_tokens == 6


async def test_invalid_tool_arguments_are_observed_then_corrected():
    """参数错误写回观察后，下一轮可完成回答。"""
    registry = ToolRegistry()

    async def handler(_args, _action):
        return ToolOutput("ok")

    registry.register(
        ToolSpec("search", "搜索", "搜索", SearchArgs, handler)
    )
    model = ScriptedModel(
        [
            ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="c1", name="search", arguments={"query": 1})])]),
            ScriptStep([ModelChunk(text_delta="已修正", finish=True)]),
        ]
    )
    events = visible(await collect_events(make_harness(model, registry), make_run(["search"])))
    assert [event.type for event in events].count("state") == 3
    finished = next(event for event in events if event.type == "tool.finished")
    assert finished.data["errorCategory"] == "INVALID_ARGUMENTS"
    assert events[-1].data["outcome"] == "ANSWERED"
    assert model.calls[1]["tools"][0]["function"]["name"] == "search"


async def test_tool_timeout_returns_to_model():
    """工具超时产生分类事件，模型可换路径完成。"""
    registry = ToolRegistry()

    async def slow(_args, _action):
        await asyncio.sleep(1)
        return ToolOutput("late")

    registry.register(ToolSpec("search", "搜索", "搜索", SearchArgs, slow, timeout_s=0.005))
    model = ScriptedModel(
        [
            ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="c1", name="search", arguments={"query": "q"})])]),
            ScriptStep([ModelChunk(text_delta="已处理超时", finish=True)]),
        ]
    )
    events = visible(await collect_events(make_harness(model, registry), make_run(["search"])))
    timeout = next(event for event in events if event.type == "tool.finished")
    assert timeout.data["errorCategory"] == "TOOL_TIMEOUT"
    assert events[-1].data["state"] == "COMPLETED"


async def test_model_turn_budget_exhaustion_fails_with_error():
    """模型轮数耗尽时以失败终态结束，不继续调用模型。"""
    registry = ToolRegistry()

    async def handler(_args, _action):
        return ToolOutput("ok")

    registry.register(ToolSpec("search", "搜索", "搜索", SearchArgs, handler))
    model = ScriptedModel(
        [ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="c1", name="search", arguments={"query": "q"})])])]
    )
    runtime = HarnessRuntimeSettings(model_turns=1)
    events = visible(await collect_events(make_harness(model, registry), make_run(["search"], runtime)))
    error = next(event for event in events if event.type == "error")
    assert error.data["category"] == "BUDGET_MODEL_TURNS"
    assert error.data["message"] == "本次运行已达到处理上限"
    assert events[-1].data["outcome"] == "FAILED"
    assert len(model.calls) == 1


async def test_no_progress_forces_final_answer_without_tools():
    """连续重复行动后强制收束，最终模型调用不再携带工具。"""
    registry = ToolRegistry()

    async def handler(_args, _action):
        return ToolOutput("same")

    registry.register(ToolSpec("search", "搜索", "搜索", SearchArgs, handler))
    call = ToolCall(call_id="c1", name="search", arguments={"query": "q"})
    model = ScriptedModel(
        [
            ScriptStep([ModelChunk(tool_calls=[call])]),
            ScriptStep([ModelChunk(tool_calls=[call])]),
            ScriptStep([ModelChunk(tool_calls=[call])]),
            ScriptStep([ModelChunk(text_delta="收束", finish=True)]),
        ]
    )
    run = make_run(["search"])
    events = await collect_events(make_harness(model, registry), run)
    assert run.force_finish is True
    assert model.calls[-1]["tools"] == []
    assert events[-1].data["outcome"] == "ANSWERED"


async def test_caller_cancellation_stops_model_and_finishes_cancelled():
    """调用方取消会中断模型等待并产生取消终态。"""
    model = ScriptedModel([ScriptStep(delay_s=10)])
    run = make_run()
    harness = make_harness(model)
    bus = EventBus(run.run_id)
    task = asyncio.create_task(harness.run(run, bus))
    await asyncio.sleep(0.01)
    task.cancel()
    await task
    await bus.close()
    events = visible([event async for event in bus.events()])
    assert events[-1].data["outcome"] == "CANCELLED"
    assert run.state == RunState.CANCELLED
    assert model.calls


async def test_reasoning_events_emitted_to_user_view():
    """思考增量与结束事件进入用户视图，增量拼接等于思考全文。"""
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(reasoning_delta="先想一下"),
                    ModelChunk(reasoning_delta="再想一下"),
                    ModelChunk(text_delta="答案", finish=True),
                ]
            )
        ]
    )
    run = make_run()
    events = visible(await collect_events(make_harness(model), run))
    deltas = [e for e in events if e.type == "reasoning.delta"]
    finished = [e for e in events if e.type == "reasoning.finished"]
    assert "".join(e.data["delta"] for e in deltas) == "先想一下再想一下"
    assert {e.data["id"] for e in deltas} == {finished[0].data["id"]}
    assert len(finished) == 1
    assert finished[0].data["status"] == "done"
    assert finished[0].data["durationMs"] >= 0
    assert any(e.type == "text.delta" for e in events)


async def test_step_note_emitted_for_tool_turn_text():
    """结构化模式下工具轮的过程说明整段发出。"""
    from harness.models import AgentDefinition
    from agents.minimal.agent import load_minimal_agent

    registry = ToolRegistry()

    async def handler(_args, _action):
        return ToolOutput(content="结果")

    registry.register(
        ToolSpec(
            name="noop_tool",
            summary="无操作",
            description="测试工具",
            args_model=SearchArgs,
            handler=handler,
        )
    )
    agent = AgentDefinition(
        **{
            **load_minimal_agent().model_dump(),
            "tools": ["noop_tool"],
            "terminal_tool": "agent_finish",
        }
    )
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(reasoning_delta="想想"),
                    ModelChunk(
                        tool_calls=[
                            ToolCall(call_id="c1", name="noop_tool", arguments={"query": "q"}),
                        ]
                    ),
                    ModelChunk(
                        text_delta="先看看目录",
                        finish=True,
                    ),
                ]
            ),
            ScriptStep(
                [
                    ModelChunk(
                        tool_calls=[
                            ToolCall(
                                call_id="c2",
                                name="agent_finish",
                                arguments={"outcome": "ANSWERED", "answer": "最终回答"},
                            ),
                        ],
                        finish=True,
                    ),
                ]
            ),
        ]
    )
    run = make_run()
    run.agent = agent
    harness = make_harness(model, registry=registry)
    events = visible(await collect_events(harness, run))
    notes = [e for e in events if e.type == "step.note"]
    assert len(notes) == 1
    assert notes[0].data["text"] == "先看看目录"
    assert "id" in notes[0].data


async def test_tool_target_and_result_projection():
    """工具事件带对象标签与结果摘要，名称只取自可见证据。"""
    from harness.models import EvidenceItem

    registry = ToolRegistry()

    async def handler(_args, _action):
        return ToolOutput(
            content="结果",
            evidence=[
                EvidenceItem(
                    evidence_id="E1",
                    source_type="note",
                    source_id="note:12",
                    content="正文",
                    title="复习提纲",
                    kb_id=3,
                    kb_name="课程库",
                    locator={"heading": "2.1"},
                )
            ],
        )

    registry.register(
        ToolSpec(
            name="kb_search",
            summary="检索知识库",
            description="测试工具",
            args_model=SearchArgs,
            handler=handler,
        )
    )
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(
                        tool_calls=[
                            ToolCall(call_id="c1", name="kb_search", arguments={"query": "期末复习"}),
                        ],
                        finish=True,
                    ),
                ]
            ),
            ScriptStep(
                [
                    ModelChunk(
                        tool_calls=[
                            ToolCall(
                                call_id="c2",
                                name="agent_finish",
                                arguments={"outcome": "ANSWERED", "answer": "最终回答"},
                            ),
                        ],
                        finish=True,
                    ),
                ]
            ),
        ]
    )
    from agents.minimal.agent import load_minimal_agent
    from harness.models import AgentDefinition

    agent = AgentDefinition(
        **{
            **load_minimal_agent().model_dump(),
            "tools": ["kb_search"],
            "terminal_tool": "agent_finish",
        }
    )
    run = make_run()
    run.agent = agent
    events = visible(await collect_events(make_harness(model, registry=registry), run))
    started = [e for e in events if e.type == "tool.started"][0]
    finished = [e for e in events if e.type == "tool.finished"][0]
    assert started.data["target"] == {"label": "期末复习", "resolved": True}
    assert finished.data["target"] == {"label": "期末复习", "resolved": True}
    assert finished.data["result"]["count"] == 1
    item = finished.data["result"]["items"][0]
    assert item["ref"] == "note:12"
    assert item["title"] == "复习提纲"
    assert item["kbName"] == "课程库"


async def test_tool_result_count_uses_diagnostics():
    """结果计数优先取工具诊断（kb_read 字数），取不到时回退本次调用登记的证据条数。"""
    from harness.models import EvidenceItem

    registry = ToolRegistry()

    async def read_handler(_args, _action):
        return ToolOutput(
            content="正文",
            evidence=[
                EvidenceItem(
                    evidence_id="E1",
                    source_type="note",
                    source_id="note:12",
                    content="正文",
                    title="复习提纲",
                )
            ],
            diagnostics={"chars": 5300},
        )

    async def plain_handler(_args, _action):
        return ToolOutput(content="结果", diagnostics={"unknown": 1})

    registry.register(
        ToolSpec(name="kb_read", summary="阅读原文", description="测试工具",
                  args_model=SearchArgs, handler=read_handler)
    )
    registry.register(
        ToolSpec(name="kb_search", summary="检索知识库", description="测试工具",
                  args_model=SearchArgs, handler=plain_handler)
    )
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(tool_calls=[
                        ToolCall(call_id="c1", name="kb_read", arguments={"query": "x"}),
                    ], finish=True),
                ]
            ),
            ScriptStep(
                [
                    ModelChunk(tool_calls=[
                        ToolCall(call_id="c2", name="kb_search", arguments={"query": "y"}),
                    ], finish=True),
                ]
            ),
            ScriptStep(
                [
                    ModelChunk(
                        tool_calls=[
                            ToolCall(call_id="c3", name="agent_finish",
                                     arguments={"outcome": "ANSWERED", "answer": "最终回答"}),
                        ],
                        finish=True,
                    ),
                ]
            ),
        ]
    )
    from agents.minimal.agent import load_minimal_agent
    from harness.models import AgentDefinition

    agent = AgentDefinition(
        **{
            **load_minimal_agent().model_dump(),
            "tools": ["kb_read", "kb_search"],
            "terminal_tool": "agent_finish",
        }
    )
    run = make_run()
    run.agent = agent
    events = visible(await collect_events(make_harness(model, registry=registry), run))
    results = {e.data["id"]: e.data["result"] for e in events if e.type == "tool.finished"}
    assert results["c1"]["count"] == 5300
    assert results["c2"]["count"] == 0
    assert results["c2"]["items"] == []

