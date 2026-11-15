"""知识检索 Agent 契约、引用验证与输出过滤测试。

@author 称霸幼儿园
"""

from agents import load_agent
from agents.knowledge_retrieval.agent import AgentFinishArgs, CitationQuote
from agents.knowledge_retrieval.response import (
    filter_external_links_and_images,
    validate_answer,
)
from harness.models import EvidenceItem, RunOutcome
from tools.knowledge import KNOWLEDGE_TOOL_NAMES


def _evidence() -> EvidenceItem:
    """构造用于引用验证的权限确认后证据。"""
    return EvidenceItem(
        evidenceId="E1",
        sourceType="note",
        sourceId="note:7",
        content="可核对的原文片段。",
        title="复习笔记",
        locator={"startLine": 3},
        kbId=2,
        kbName="课程库",
        permissionBasis="MEMBER",
    )


def test_knowledge_retrieval_agent_loads_three_files_and_seven_tools():
    """加载契约、指令、上下文策略与只读工具名。"""
    agent = load_agent("knowledge-retrieval")

    assert agent.name == "knowledge-retrieval"
    assert agent.version == "1"
    assert agent.terminal_tool == "agent_finish"
    assert agent.tools == list(KNOWLEDGE_TOOL_NAMES)
    assert agent.context_policy["evidence_trust_level"] == "UNTRUSTED_CONTENT"
    assert "agent_finish" in agent.instructions


def test_answer_validation_requires_existing_evidence_and_exact_quote():
    """只接受编号存在且原文片段确实出现在证据里的引用。"""
    valid = validate_answer(
        "结论[1]",
        AgentFinishArgs(outcome="ANSWERED", citations=[CitationQuote(index=1, quote="原文片段")]),
        [_evidence()],
        "课程库",
    )
    invalid = validate_answer(
        "结论[2]",
        AgentFinishArgs(outcome="ANSWERED", citations=[CitationQuote(index=2, quote="不存在")]),
        [_evidence()],
        "课程库",
    )

    assert valid.issues == []
    assert valid.citations[0][1].evidence_id == "E1"
    assert valid.citations[0][2] == "原文片段"
    assert invalid.issues == ["INVALID_CITATION", "MISSING_VALID_CITATION"]
    assert invalid.answer == "结论"


def test_empty_evidence_changes_answered_signal_to_approved_not_found_result():
    """证据为空时不保留模型回答并返回固定未找到结果。"""
    result = validate_answer(
        "模型自答",
        AgentFinishArgs(outcome="ANSWERED"),
        [],
        "课程库",
    )

    assert result.outcome == RunOutcome.NOT_FOUND
    assert result.answer == "未找到相关内容。已查询范围：课程库"
    assert result.citations == []


def test_clarification_signal_keeps_at_most_one_question():
    """澄清终态最多保留 Agent 生成的一个问题。"""
    result = validate_answer(
        "",
        AgentFinishArgs(
            outcome="NEEDS_CLARIFICATION",
            clarification_question="你指哪门课？哪个学期？",
        ),
        [],
        "默认范围",
    )

    assert result.outcome == RunOutcome.NEEDS_CLARIFICATION
    assert result.answer == "你指哪门课？"
    assert result.issues == ["MULTIPLE_CLARIFICATION_QUESTIONS"]


def test_output_filter_removes_images_and_external_links_only():
    """输出过滤删除图片和外链，保留内部链接文字与目标。"""
    result = filter_external_links_and_images(
        "看图 ![说明](https://example.test/a.png) [外链](https://example.test) "
        "[笔记](/notes/7) https://example.test/raw <img src='/x.png'>"
    )

    assert result == "看图  外链 [笔记](/notes/7)"


def test_output_filter_removes_reference_images_and_html_external_anchors():
    """过滤引用式图片和 HTML 外链，保留可见文字。"""
    result = filter_external_links_and_images(
        "![引用图片][image-ref] <a href='https://example.test'>网页外链</a>"
    )

    assert "引用图片" not in result
    assert "网页外链" in result
    assert "https://" not in result
