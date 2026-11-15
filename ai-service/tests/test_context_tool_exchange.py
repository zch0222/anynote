"""工具交互进入上下文、不可降级错误与 Trace 诊断的确定性测试。

@author 称霸幼儿园
"""

from harness.action.plane import FatalActionError
from harness.action.registry import ToolOutput, ToolRegistry, ToolSpec
from harness.context.builder import ContextBuilder
from harness.context.policy import EVIDENCE_BEGIN, EVIDENCE_END
from harness.models import (
    ActionStatus,
    ModelChunk,
    Observation,
    RunOutcome,
    RunScope,
    RunState,
    ToolCall,
    ToolExchange,
)
from models.scripted import ScriptedModel, ScriptStep
from tests.conftest import CharacterCounter, collect_events, make_harness, make_run
from tests.test_action import SearchArgs


def _exchange(call_id: str, content: str) -> ToolExchange:
    return ToolExchange(
        calls=[ToolCall(call_id=call_id, name="search", arguments={"query": "q"})],
        observations=[Observation(call_id=call_id, tool_name="search", status=ActionStatus.SUCCESS, content=content)],
    )


async def test_builder_compiles_tool_calls_and_untrusted_tool_messages():
    """工具交互按 assistant tool_calls 与 tool 消息成对编入问题之后，tool 内容带不可信定界。"""
    run = make_run(tools=["search"])
    run.tool_exchanges = [_exchange("c1", "结果一")]
    result = await ContextBuilder(ScriptedModel([]), CharacterCounter()).build(run, [])

    assistant, tool = result.messages[-2], result.messages[-1]
    assert result.messages[-3]["content"] == "测试问题"
    assert assistant["role"] == "assistant"
    assert assistant["tool_calls"][0]["id"] == "c1"
    assert assistant["tool_calls"][0]["function"] == {"name": "search", "arguments": '{"query": "q"}'}
    assert tool == {"role": "tool", "tool_call_id": "c1", "content": f"{EVIDENCE_BEGIN}\n结果一\n{EVIDENCE_END}"}
    entries = {entry.source_type: entry for entry in result.manifest.entries}
    assert entries["tool_result"].trust_level == "UNTRUSTED_CONTENT"
    assert entries["tool_call"].source_id == "c1"


async def test_builder_truncates_oldest_tool_results_but_keeps_pairs():
    """预算不足时从最早一轮开始截断工具结果，调用与结果仍然成对。"""
    run = make_run(tools=["search"])
    run.runtime.context_tokens = 1024
    run.tool_exchanges = [_exchange("c1", "旧" * 3000), _exchange("c2", "新" * 50)]
    result = await ContextBuilder(ScriptedModel([]), CharacterCounter()).build(run, [])

    tool_messages = [message for message in result.messages if message["role"] == "tool"]
    assert [message["tool_call_id"] for message in tool_messages] == ["c1", "c2"]
    assert len(tool_messages[0]["content"]) < 3000
    assert "新" * 50 in tool_messages[1]["content"]
    transforms = {entry.source_id: entry.transform for entry in result.manifest.entries
                  if entry.source_type == "tool_result"}
    assert transforms == {"c1": "TRUNCATED", "c2": "ORIGINAL"}


async def test_builder_serializes_run_scope_in_runtime_layer():
    """运行提示里的检索范围以 camelCase 序列化。"""
    run = make_run()
    run.request.scope = RunScope(knowledgeBaseIds=[3])
    result = await ContextBuilder(ScriptedModel([]), CharacterCounter()).build(run, [])
    assert '"knowledgeBaseIds": [3]' in result.messages[0]["content"]


async def test_loop_records_exchange_feeds_it_back_and_emits_diagnostics_to_trace():
    """循环把工具交互写回上下文，第二轮模型能看到 tool 消息；诊断只进 trace.action。"""

    async def handler(args, action):
        return ToolOutput(content="命中 1 条", diagnostics={"dropped": 0})

    registry = ToolRegistry()
    registry.register(ToolSpec(name="search", summary="检索", description="检索", args_model=SearchArgs,
                               handler=handler))
    model = ScriptedModel([
        ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="c1", name="search", arguments={"query": "q"})])]),
        ScriptStep([ModelChunk(text_delta="答案", finish=True)]),
    ])
    run = make_run(tools=["search"])
    events = await collect_events(make_harness(model, registry=registry), run)

    assert len(run.tool_exchanges) == 1
    second_messages = model.calls[1]["messages"]
    assert second_messages[-1]["role"] == "tool"
    assert "命中 1 条" in second_messages[-1]["content"]
    assert model.calls[1]["containsKnowledge"] is True
    trace = next(event for event in events if event.type == "trace.action")
    assert trace.data["attributes"]["actions"][0]["diagnostics"] == {"dropped": 0}
    finished = next(event for event in events if event.type == "tool.finished")
    assert "diagnostics" not in finished.data


async def test_fatal_action_error_fails_run_with_category():
    """权限无法确认的不可降级错误使运行直接失败，错误类别透传、文案用已有提示。"""

    async def handler(args, action):
        raise FatalActionError("KNOWLEDGE_ACCESS_UNAVAILABLE")

    registry = ToolRegistry()
    registry.register(ToolSpec(name="search", summary="检索", description="检索", args_model=SearchArgs,
                               handler=handler))
    model = ScriptedModel([
        ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="c1", name="search", arguments={"query": "q"})])]),
    ])
    run = make_run(tools=["search"])
    events = await collect_events(make_harness(model, registry=registry), run)

    assert run.state == RunState.FAILED
    assert run.outcome == RunOutcome.FAILED
    error = next(event for event in events if event.type == "error")
    assert error.data == {"category": "KNOWLEDGE_ACCESS_UNAVAILABLE", "retryable": False,
                          "message": "服务暂时不可用，请稍后重试"}
