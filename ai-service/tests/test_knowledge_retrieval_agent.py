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


def _row_evidence() -> EvidenceItem:
    """构造 kb_list 登记的知识库结构化行证据。"""
    return EvidenceItem(
        evidenceId="E1",
        sourceType="kb",
        sourceId="kb:3",
        content="笔记 12 · 资料 3 · 慕课 0 · 任务 1",
        title="课程库",
        locator={"row": True},
        kbId=3,
        kbName="课程库",
        structured=True,
    )


def test_knowledge_retrieval_agent_loads_three_files_and_seven_tools():
    """加载契约、指令、上下文策略与只读工具名。"""
    agent = load_agent("knowledge-retrieval")

    assert agent.name == "knowledge-retrieval"
    assert agent.version == "2"
    assert agent.terminal_tool == "agent_finish"
    assert agent.tools == list(KNOWLEDGE_TOOL_NAMES)
    assert agent.context_policy["evidence_trust_level"] == "UNTRUSTED_CONTENT"
    assert "agent_finish" in agent.instructions


def test_instructions_route_catalog_questions_and_explain_citable_rows():
    """指令按问题类型分派全部七个工具，并说明哪些结果可引用、回答写在哪里。"""
    instructions = load_agent("knowledge-retrieval").instructions

    for name in KNOWLEDGE_TOOL_NAMES:
        assert name in instructions
    assert "我有哪些知识库" in instructions
    assert "evidenceId" in instructions
    assert "answer" in instructions


def test_answer_validation_requires_existing_evidence_and_exact_quote():
    """正文类证据只接受编号存在且原文片段确实出现在证据里的引用。"""
    valid = validate_answer(
        AgentFinishArgs(
            outcome="ANSWERED",
            answer="结论[1]",
            citations=[CitationQuote(index=1, quote="原文片段")],
        ),
        [_evidence()],
        "课程库",
    )
    invalid = validate_answer(
        AgentFinishArgs(
            outcome="ANSWERED",
            answer="结论[2]",
            citations=[CitationQuote(index=2, quote="不存在")],
        ),
        [_evidence()],
        "课程库",
    )
    paraphrased = validate_answer(
        AgentFinishArgs(
            outcome="ANSWERED",
            answer="结论[1]",
            citations=[CitationQuote(index=1, quote="改写过的原文")],
        ),
        [_evidence()],
        "课程库",
    )

    assert valid.issues == []
    assert valid.citations[0][1].evidence_id == "E1"
    assert valid.citations[0][2] == "原文片段"
    assert invalid.issues == ["INVALID_CITATION", "MISSING_VALID_CITATION"]
    assert invalid.answer == "结论"
    assert paraphrased.issues == ["INVALID_CITATION", "MISSING_VALID_CITATION"]


def test_structured_row_citation_needs_no_quote_and_uses_server_snippet():
    """清单类证据只核对编号；模型给的片段被忽略，来源片段由服务端生成。"""
    with_quote = validate_answer(
        AgentFinishArgs(
            outcome="ANSWERED",
            answer="你有 1 个知识库：课程库[1]",
            citations=[CitationQuote(index=1, quote='{"kbId":3,"name":"课程库"}')],
        ),
        [_row_evidence()],
        "默认范围",
    )
    without_quote = validate_answer(
        AgentFinishArgs(outcome="ANSWERED", answer="课程库[1]"),
        [_row_evidence()],
        "默认范围",
    )

    assert with_quote.outcome == RunOutcome.ANSWERED
    assert with_quote.issues == []
    assert with_quote.answer == "你有 1 个知识库：课程库[1]"
    assert with_quote.citations[0][1].source_id == "kb:3"
    assert with_quote.citations[0][2] == "笔记 12 · 资料 3 · 慕课 0 · 任务 1"
    assert without_quote.issues == []
    assert [item[0] for item in without_quote.citations] == [1]


def test_answer_text_comes_only_from_finish_signal():
    """ANSWERED 缺少 answer 时报空回答，不回退到助手正文。"""
    result = validate_answer(
        AgentFinishArgs(outcome="ANSWERED", citations=[CitationQuote(index=1, quote="原文片段")]),
        [_evidence()],
        "课程库",
    )

    assert result.outcome == RunOutcome.ANSWERED
    assert "EMPTY_ANSWER" in result.issues
    assert "MISSING_VALID_CITATION" in result.issues


def test_empty_evidence_changes_answered_signal_to_approved_not_found_result():
    """证据为空时不保留模型回答并返回固定未找到结果。"""
    result = validate_answer(
        AgentFinishArgs(outcome="ANSWERED", answer="模型自答"),
        [],
        "课程库",
    )

    assert result.outcome == RunOutcome.NOT_FOUND
    assert result.answer == "未找到相关内容。已查询范围：课程库"
    assert result.citations == []


def test_clarification_signal_keeps_at_most_one_question():
    """澄清终态最多保留 Agent 生成的一个问题。"""
    result = validate_answer(
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
