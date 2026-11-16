"""上下文构建、压缩与清单测试。

@author 称霸幼儿园
"""

import json

from core.config import HarnessRuntimeSettings
from harness.budget import BudgetMiddleware
from harness.context.builder import ContextBuilder
from harness.middleware import Hook, MiddlewareContext
from harness.models import ChatMessage, EvidenceItem, ModelChunk, TokenUsage
from harness.middleware import MiddlewareDecision
from models.scripted import ScriptedModel, ScriptStep
from tests.conftest import CharacterCounter, make_run


async def test_history_compaction_uses_fast_model_and_keeps_recent_messages():
    """较早历史由 fast 压缩，最近原文和清单处理标记保留。"""
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(
                        text_delta="目标：测试；出处：note:1",
                        usage=TokenUsage(prompt_tokens=8, completion_tokens=3, total_tokens=11, known=True),
                    )
                ]
            )
        ]
    )
    history = [ChatMessage(role="user", content=f"历史 {index}") for index in range(10)]
    run = make_run(history=history)
    run.runtime.history_compaction_threshold = 8
    run.runtime.history_recent_messages = 4
    builder = ContextBuilder(model, CharacterCounter())
    result = await builder.build(run, [])
    await builder.build(run, [])
    assert len(model.calls) == 1
    assert model.calls[0]["logicalName"] == "fast"
    assert model.calls[0]["containsKnowledge"] is True
    assert "历史 9" in result.messages[-2]["content"]
    assert any(item.transform == "SUMMARY" for item in result.manifest.entries)
    assert result.additional_usage.total_tokens == 11


async def test_large_evidence_uses_workspace_reference_and_untrusted_delimiter():
    """大证据不原文进窗口，清单记录引用与不可信层级。"""
    run = make_run()
    run.runtime.large_result_chars = 20
    run.runtime.large_result_preview_chars = 8
    run.workspace.add_evidence(
        [
            EvidenceItem(
                evidence_id="e1",
                source_type="note",
                source_id="note:1#2",
                content="abcdefghijklmnopqrstuvwxyz123456",
                version="7",
                permission_basis="成员",
            )
        ]
    )
    model = ScriptedModel([])
    result = await ContextBuilder(model, CharacterCounter()).build(run, [])
    evidence = next(item for item in result.manifest.entries if item.source_type == "note")
    assert evidence.transform == "REFERENCE"
    assert evidence.trust_level == "UNTRUSTED_CONTENT"
    assert evidence.permission_basis == "成员"
    assert "完整结果引用: result:" in result.messages[-2]["content"]


async def test_context_budget_rejects_overflow_instead_of_calling_model():
    """编译结果超过上下文预算时中间件短路。"""
    run = make_run(runtime=HarnessRuntimeSettings(context_tokens=1024))
    prepared = type("Prepared", (), {"token_count": 1025})()
    decision = await BudgetMiddleware().handle(
        MiddlewareContext(run=run, hook=Hook.AFTER_PREPARE, payload=prepared)
    )
    assert decision.error_category == "BUDGET_CONTEXT_TOKENS"
    assert decision.outcome == "FAILED"


def test_manifest_does_not_contain_access_token():
    """清单字段不保存用户令牌。"""
    run = make_run()
    run.workspace.add_evidence(
        [EvidenceItem(evidence_id="e1", source_type="note", source_id="1", content="正文")]
    )
    assert "secret-user-token" not in run.workspace.evidence_fingerprint()
    assert "secret-user-token" not in repr(run)


async def test_context_sends_tool_definitions_only_in_tools_parameter():
    """工具 JSON 不拼进系统提示，清单保留引用记录，上下文预算只计一份。"""
    run = make_run(["search"])
    tools = [
        {
            "type": "function",
            "function": {"name": "search", "description": "搜索", "parameters": {"type": "object"}},
        }
    ]
    model = ScriptedModel([])

    result = await ContextBuilder(model, CharacterCounter()).build(run, tools)

    system = result.messages[0]["content"]
    tool_layer = next(item for item in result.manifest.entries if item.source_type == "tools")
    assert '"name": "search"' not in system
    assert result.tools == tools
    assert tool_layer.transform == "REFERENCE"
    assert tool_layer.token_count == len(json.dumps(tools, ensure_ascii=False))
    assert result.token_count == len(json.dumps(result.messages, ensure_ascii=False)) + len(
        json.dumps(tools, ensure_ascii=False)
    )


async def test_budget_hint_is_recomputed_without_accumulating_between_turns():
    """接近预算上限的持续提示每轮重新计算，不在系统提示中累积重复项。"""
    run = make_run(runtime=HarnessRuntimeSettings(model_turns=5))
    run.model_turns = 4
    builder = ContextBuilder(ScriptedModel([]), CharacterCounter())
    middleware = BudgetMiddleware()

    first = await middleware.handle(MiddlewareContext(run=run, hook=Hook.BEFORE_PREPARE))
    run.apply_updates(first.state_updates)
    first_result = await builder.build(run, [])
    second = await middleware.handle(MiddlewareContext(run=run, hook=Hook.BEFORE_PREPARE))
    run.apply_updates(second.state_updates)
    second_result = await builder.build(run, [])

    assert first_result.messages[0]["content"].count("模型轮数接近上限") == 1
    assert second_result.messages[0]["content"].count("模型轮数接近上限") == 1
