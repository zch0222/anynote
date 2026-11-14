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
