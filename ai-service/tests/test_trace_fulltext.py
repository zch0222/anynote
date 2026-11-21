"""Trace 全文投影测试。

@author 称霸幼儿园
"""

import json

from core.config import HarnessRuntimeSettings
from harness.action.plane import ToolExecutionError
from harness.action.registry import ToolOutput, ToolRegistry, ToolSpec
from harness.context.manifest import ManifestEntry
from harness.models import ActionErrorCategory, AgentDefinition, EvidenceItem, ModelChunk, TokenUsage, ToolCall
from models.scripted import ScriptedModel, ScriptStep
from tests.conftest import collect_events, make_harness, make_run
from tests.test_action import SearchArgs

MANIFEST_ENTRY_KEYS = {
    "sourceType", "sourceId", "scope", "version", "trustLevel", "permissionBasis",
    "selectedReason", "tokenCount", "transform", "contentHash",
}


def _agent_with_tools(tools: list[str]):
    """构造带终止工具的 Agent 定义。

    :param tools: 可用工具名
    :return: Agent 定义
    """
    from agents.minimal.agent import load_minimal_agent

    return AgentDefinition(
        **{
            **load_minimal_agent().model_dump(),
            "tools": tools,
            "terminal_tool": "agent_finish",
        }
    )


def _finish(answer: str = "回答", call_id: str = "fin") -> ScriptStep:
    """生成一个提交回答的模型轮。"""
    return ScriptStep([
        ModelChunk(
            tool_calls=[ToolCall(call_id=call_id, name="agent_finish",
                                 arguments={"outcome": "ANSWERED", "answer": answer})],
            finish=True,
        )
    ])


def _search_registry(content: str = "原始结果正文") -> ToolRegistry:
    """注册一个返回一条证据的检索工具。"""
    registry = ToolRegistry()

    async def handler(_args, _action):
        return ToolOutput(
            content=content,
            evidence=[
                EvidenceItem(
                    evidence_id="E1",
                    source_type="note",
                    source_id="note:12",
                    content="证据正文",
                    title="标题",
                )
            ],
        )

    registry.register(
        ToolSpec(name="kb_search", summary="检索知识库", description="测试", args_model=SearchArgs, handler=handler)
    )
    return registry


async def test_trace_context_entries_never_carry_content():
    """trace.context 的清单条目只有元数据字段，层原文只经 blobs 写入。"""
    model = ScriptedModel(
        [
            ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="c1", name="kb_search", arguments={"query": "期末复习"})])]),
            _finish("回答[1]"),
        ]
    )
    run = make_run()
    run.agent = _agent_with_tools(["kb_search"])
    events = await collect_events(make_harness(model, _search_registry()), run)
    contexts = [e for e in events if e.type == "trace.context"]
    assert contexts
    for event in contexts:
        assert set(event.data["attributes"]) <= {"manifest", "blobs"}
        for entry in event.data["attributes"]["manifest"]["entries"]:
            assert set(entry) == MANIFEST_ENTRY_KEYS
    assert contexts[0].data["attributes"]["blobs"]
    deps = [e for e in events if e.type == "trace.dependencies"]
    assert deps and deps[0].data["dependencies"] == ["note:12"]


async def test_trace_blobs_written_once_per_hash_in_run():
    """连续多轮调用时，同一哈希在整次运行的 blobs 里只出现一次，且覆盖全部清单条目。"""
    model = ScriptedModel(
        [
            ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="c1", name="kb_search", arguments={"query": "一"})])]),
            ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="c2", name="kb_search", arguments={"query": "二"})])]),
            _finish("回答[1]"),
        ]
    )
    run = make_run()
    run.agent = _agent_with_tools(["kb_search"])
    events = await collect_events(make_harness(model, _search_registry()), run)
    contexts = [e for e in events if e.type == "trace.context"]
    assert len(contexts) >= 3
    hashes = [blob["hash"] for event in contexts for blob in event.data["attributes"].get("blobs", [])]
    assert len(hashes) == len(set(hashes))
    referenced = {
        entry["contentHash"]
        for event in contexts
        for entry in event.data["attributes"]["manifest"]["entries"]
    }
    assert referenced <= set(hashes)


def test_manifest_entry_dump_excludes_content():
    """ManifestEntry 的任何序列化都不带原文。"""
    entry = ManifestEntry(
        source_type="platform",
        source_id="platform-rules",
        scope="platform",
        version="1",
        trust_level="PLATFORM",
        selected_reason="平台规则",
        token_count=3,
        transform="ORIGINAL",
        content_hash="abc",
        content="平台规则原文",
    )
    assert "content" not in entry.model_dump()
    assert "content" not in entry.model_dump(mode="json", by_alias=True)
    assert entry.content == "平台规则原文"


async def test_trace_includes_reasoning_draft_arguments_and_results():
    """Trace 记录思考全文、草稿、完整参数、原始结果与证据编号。"""
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(reasoning_delta="先想"),
                    ModelChunk(tool_calls=[ToolCall(call_id="c1", name="kb_search", arguments={"query": "期末复习"})]),
                ]
            ),
            _finish("回答[1]"),
        ]
    )
    run = make_run()
    run.agent = _agent_with_tools(["kb_search"])
    events = await collect_events(make_harness(model, _search_registry()), run)
    actions = [e for e in events if e.type == "trace.action"]
    entry = actions[0].data["attributes"]["actions"][0]
    assert entry["arguments"] == {"query": "期末复习"}
    assert entry["result"] == "原始结果正文"
    assert entry["evidenceIds"] == ["E1"]
    first_model = [e for e in events if e.type == "trace.model"][0].data["attributes"]
    assert first_model["reasoning"] == "先想"
    assert "draft" in first_model


async def test_trace_result_truncated_at_limit():
    """原始结果超过上限时截断并标注全文长度。"""
    registry = ToolRegistry()

    async def handler(_args, _action):
        return ToolOutput(content="字" * 600)

    registry.register(
        ToolSpec(name="kb_search", summary="检索知识库", description="测试", args_model=SearchArgs, handler=handler)
    )
    model = ScriptedModel(
        [
            ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="c1", name="kb_search", arguments={"query": "q"})])]),
            _finish(),
        ]
    )
    run = make_run(runtime=HarnessRuntimeSettings(trace_result_max_chars=500))
    run.agent = _agent_with_tools(["kb_search"])
    events = await collect_events(make_harness(model, registry), run)
    entry = [e for e in events if e.type == "trace.action"][0].data["attributes"]["actions"][0]
    assert entry["result"].startswith("字" * 500)
    assert "300 字" not in entry["result"]
    assert "600 字" in entry["result"]


async def test_trace_model_records_first_output_and_attempts():
    """有输出的模型轮带首字时间；重试一次后尝试次数为 2。"""
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(reasoning_delta="想一半"),
                    ModelChunk(retry_attempt=2, reasoning_interrupted=True),
                    ModelChunk(reasoning_delta="重新想"),
                    ModelChunk(tool_calls=[ToolCall(call_id="c1", name="kb_search", arguments={"query": "q"})]),
                ]
            ),
            _finish("回答[1]"),
        ]
    )
    run = make_run()
    run.agent = _agent_with_tools(["kb_search"])
    events = await collect_events(make_harness(model, _search_registry()), run)
    first = [e for e in events if e.type == "trace.model"][0].data["attributes"]
    assert first["attempts"] == 2
    assert isinstance(first["firstOutputMs"], int) and first["firstOutputMs"] >= 0
    assert first["reasoning"] == "想一半重新想"


async def test_trace_action_records_error_message_of_failed_tool():
    """失败工具的错误原文只进 Trace。"""
    registry = ToolRegistry()

    async def handler(_args, _action):
        raise ToolExecutionError(ActionErrorCategory.INVALID_ARGUMENTS, "参数 kb_ids 超出范围")

    registry.register(
        ToolSpec(name="kb_search", summary="检索知识库", description="测试", args_model=SearchArgs, handler=handler)
    )
    model = ScriptedModel(
        [
            ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="c1", name="kb_search", arguments={"query": "q"})])]),
            _finish(),
        ]
    )
    run = make_run()
    run.agent = _agent_with_tools(["kb_search"])
    events = await collect_events(make_harness(model, registry), run)
    entry = [e for e in events if e.type == "trace.action"][0].data["attributes"]["actions"][0]
    assert entry["errorMessage"] == "参数 kb_ids 超出范围"
    finished = [e for e in events if e.type == "tool.finished"][0].data
    assert "参数 kb_ids 超出范围" not in json.dumps(finished, ensure_ascii=False)


async def test_trace_verify_repair_hint_is_the_appended_hint():
    """trace.verify 的修复提示等于该轮实际追加给下一轮模型的提示。"""
    model = ScriptedModel([
        ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="c1", name="kb_search", arguments={"query": "q"})])]),
        _finish("结论[9]", "f1"),
        _finish("结论[1]", "f2"),
    ])
    run = make_run()
    run.agent = _agent_with_tools(["kb_search"])
    events = await collect_events(make_harness(model, _search_registry()), run)
    verify = [e for e in events if e.type == "trace.verify"]
    hint = verify[0].data["attributes"]["repairHint"]
    assert hint.startswith("上一次回答没有通过校验")
    assert json.dumps(hint, ensure_ascii=False)[1:-1] in model.calls[2]["messages"][0]["content"]
    assert verify[0].data["attributes"]["answerBeforeRepair"] == "结论[9]"


async def test_trace_model_usage_is_per_turn():
    """每轮的推理 token 只取本轮用量，不用整次运行的累计值顶替。"""
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(
                        tool_calls=[ToolCall(call_id="c1", name="kb_search", arguments={"query": "q"})],
                        usage=TokenUsage(prompt_tokens=3, completion_tokens=2, total_tokens=5,
                                         reasoning_tokens=7, known=True),
                    ),
                ]
            ),
            ScriptStep(
                [
                    ModelChunk(
                        tool_calls=[ToolCall(call_id="fin", name="agent_finish",
                                             arguments={"outcome": "ANSWERED", "answer": "回答[1]"})],
                        usage=TokenUsage(prompt_tokens=3, completion_tokens=2, total_tokens=5, known=True),
                        finish=True,
                    )
                ]
            ),
        ]
    )
    run = make_run()
    run.agent = _agent_with_tools(["kb_search"])
    events = await collect_events(make_harness(model, _search_registry()), run)
    spans = [e.data["attributes"] for e in events if e.type == "trace.model"]
    assert spans[0]["usage"]["reasoningTokens"] == 7
    assert spans[1]["usage"]["reasoningTokens"] is None
