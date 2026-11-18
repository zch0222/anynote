"""Trace 全文投影测试。

@author 称霸幼儿园
"""

from core.config import HarnessRuntimeSettings
from harness.action.registry import ToolOutput, ToolRegistry, ToolSpec
from harness.models import AgentDefinition, EvidenceItem, ModelChunk, ToolCall
from models.scripted import ScriptedModel, ScriptStep
from tests.conftest import collect_events, make_harness, make_run
from tests.test_action import SearchArgs


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


async def test_trace_fulltext_off_keeps_legacy_fields():
    """开关关闭时 Trace 事件字段与现状一致：无正文、无参数、无结果原文。"""
    registry = ToolRegistry()

    async def handler(_args, _action):
        return ToolOutput(
            content="很长的原始结果" * 50,
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
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(reasoning_delta="思考不进 Trace 主体字段"),
                    ModelChunk(tool_calls=[ToolCall(call_id="c1", name="kb_search", arguments={"query": "期末复习"})]),
                ]
            ),
            ScriptStep(
                [
                    ModelChunk(
                        tool_calls=[
                            ToolCall(call_id="c2", name="agent_finish", arguments={"outcome": "ANSWERED", "answer": "回答"}),
                        ],
                        finish=True,
                    ),
                ]
            ),
        ]
    )
    run = make_run(runtime=HarnessRuntimeSettings())
    run.agent = _agent_with_tools(["kb_search"])
    events = await collect_events(make_harness(model, registry), run)
    actions = [e for e in events if e.type == "trace.action"]
    model_spans = [e for e in events if e.type == "trace.model"]
    contexts = [e for e in events if e.type == "trace.context"]
    assert actions, "应至少有一个 action Trace"
    entry = actions[0].data["attributes"]["actions"][0]
    assert "result" not in entry
    assert "arguments" not in entry
    assert "reasoning" not in model_spans[0].data["attributes"]
    assert "blobs" not in contexts[0].data["attributes"]
    deps = [e for e in events if e.type == "trace.dependencies"]
    assert deps and deps[0].data["dependencies"] == ["note:12"]


async def test_trace_fulltext_on_includes_blobs_draft_and_results():
    """开关打开时 Trace 记录层原文、思考全文、草稿、完整参数与原始结果。"""
    registry = ToolRegistry()

    async def handler(_args, _action):
        return ToolOutput(
            content="原始结果正文",
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
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(reasoning_delta="先想"),
                    ModelChunk(tool_calls=[ToolCall(call_id="c1", name="kb_search", arguments={"query": "期末复习"})]),
                ]
            ),
            ScriptStep(
                [
                    ModelChunk(
                        tool_calls=[
                            ToolCall(call_id="c2", name="agent_finish", arguments={"outcome": "ANSWERED", "answer": "回答"}),
                        ],
                        finish=True,
                    ),
                ]
            ),
        ]
    )
    run = make_run(runtime=HarnessRuntimeSettings(trace_fulltext_enabled=True))
    run.agent = _agent_with_tools(["kb_search"])
    events = await collect_events(make_harness(model, registry), run)
    contexts = [e for e in events if e.type == "trace.context"]
    assert contexts[0].data["attributes"]["blobs"], "上下文层原文应以哈希键写入 blobs"
    first_entry = contexts[0].data["attributes"]["manifest"]["entries"][0]
    assert "content" not in first_entry, "清单条目不再内嵌原文"

    actions = [e for e in events if e.type == "trace.action"]
    entry = actions[0].data["attributes"]["actions"][0]
    assert entry["arguments"] == {"query": "期末复习"}
    assert entry["result"] == "原始结果正文"
    assert entry["evidenceIds"] == ["E1"]

    model_spans = [e for e in events if e.type == "trace.model"]
    first_model = model_spans[0].data["attributes"]
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
            ScriptStep(
                [
                    ModelChunk(tool_calls=[ToolCall(call_id="c1", name="kb_search", arguments={"query": "q"})]),
                ]
            ),
            ScriptStep(
                [
                    ModelChunk(
                        tool_calls=[
                            ToolCall(call_id="c2", name="agent_finish", arguments={"outcome": "ANSWERED", "answer": "回答"}),
                        ],
                        finish=True,
                    ),
                ]
            ),
        ]
    )
    run = make_run(runtime=HarnessRuntimeSettings(trace_fulltext_enabled=True, trace_result_max_chars=500))
    run.agent = _agent_with_tools(["kb_search"])
    events = await collect_events(make_harness(model, registry), run)
    entry = [e for e in events if e.type == "trace.action"][0].data["attributes"]["actions"][0]
    assert entry["result"].startswith("字" * 500)
    assert "300 字" not in entry["result"]
    assert "600 字" in entry["result"]
