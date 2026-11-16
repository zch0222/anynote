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
    assert agent.version == "3"
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
    assert valid.citations[0][2] is None
    assert [issue.code for issue in invalid.issues] == ["INVALID_CITATION", "MISSING_CITATION"]
    assert invalid.answer == "结论"
    assert [issue.code for issue in paraphrased.issues] == ["INVALID_CITATION", "MISSING_CITATION"]


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


def test_empty_answer_signal_reports_format_and_source_gaps():
    """ANSWERED 缺少 answer 时报告空回答与缺失来源缺口。"""
    result = validate_answer(
        AgentFinishArgs(outcome="ANSWERED", citations=[CitationQuote(index=1, quote="原文片段")]),
        [_evidence()],
        "课程库",
    )

    assert result.outcome == RunOutcome.ANSWERED
    assert [issue.code for issue in result.issues] == ["MISSING_CITATION", "EMPTY_ANSWER"]


def test_empty_evidence_after_tool_call_changes_answer_to_not_found():
    """调用过工具仍无证据时不保留模型自己的知识回答。"""
    result = validate_answer(
        AgentFinishArgs(outcome="ANSWERED", answer="模型自答"),
        [],
        "课程库",
        tool_calls=1,
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
    assert result.issues == []


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


def test_answer_validation_returns_structured_gaps_and_degrades_after_repair():
    """无效编号与缺失来源合并返回结构化缺口，修复耗尽后降级交付。"""
    invalid = validate_answer(
        AgentFinishArgs(
            outcome="ANSWERED",
            answer="结论[2]",
            citations=[CitationQuote(index=2, quote="不存在")],
        ),
        [_evidence()],
        "课程库",
    )
    degraded = validate_answer(
        AgentFinishArgs(
            outcome="ANSWERED",
            answer="结论[2]",
            citations=[CitationQuote(index=2, quote="不存在")],
        ),
        [_evidence()],
        "课程库",
        repair_exhausted=True,
    )

    assert [issue.code for issue in invalid.issues] == ["INVALID_CITATION", "MISSING_CITATION"]
    assert invalid.issues[0].indices == [2]
    assert invalid.issues[0].repairable is True
    assert degraded.answer == "结论"
    assert degraded.answer_notices == ["UNSOURCED", "CITATIONS_REMOVED"]
    assert degraded.citations == []


def test_missing_citation_is_delivered_with_notice_after_repair():
    """有证据但修复后仍无有效引用时保留正文并标注未标注来源。"""
    result = validate_answer(
        AgentFinishArgs(outcome="ANSWERED", answer="没有编号的回答"),
        [_evidence()],
        "课程库",
        repair_exhausted=True,
    )

    assert [issue.code for issue in result.issues] == ["MISSING_CITATION"]
    assert result.answer == "没有编号的回答"
    assert result.answer_notices == ["UNSOURCED"]


def test_body_citation_quote_is_optional_and_snippet_uses_search_highlight():
    """正文引用未附原文时只核对编号，界面片段取去除标签的检索高亮。"""
    evidence = _evidence().model_copy(
        update={"retrieval": {"highlight": "<em>可核对</em>的原文片段。"}}
    )
    result = validate_answer(
        AgentFinishArgs(outcome="ANSWERED", answer="结论[1]"),
        [evidence],
        "课程库",
    )

    assert result.issues == []
    assert result.citations[0][2] == "可核对的原文片段。"


def test_answer_without_evidence_distinguishes_conversation_from_tool_fallback():
    """无工具回答标注非知识库来源，调用过工具的空证据回答仍改写为未找到。"""
    conversation = validate_answer(
        AgentFinishArgs(outcome="ANSWERED", answer="你好，我可以帮助查询知识库。"),
        [],
        "默认范围",
        tool_calls=0,
    )
    fallback = validate_answer(
        AgentFinishArgs(outcome="ANSWERED", answer="根据我的知识回答"),
        [],
        "默认范围",
        tool_calls=1,
    )

    assert conversation.outcome == RunOutcome.ANSWERED
    assert conversation.answer_notices == ["NOT_FROM_KNOWLEDGE"]
    assert fallback.outcome == RunOutcome.NOT_FOUND
    assert fallback.answer == "未找到相关内容。已查询范围：默认范围"


def test_empty_answer_and_missing_clarification_have_confirmed_fallbacks():
    """修复后空回答改写为未找到，空澄清问题使用已确认固定问题。"""
    empty = validate_answer(
        AgentFinishArgs(outcome="ANSWERED", answer=""),
        [_evidence()],
        "课程库",
        repair_exhausted=True,
    )
    clarification = validate_answer(
        AgentFinishArgs(outcome="NEEDS_CLARIFICATION"),
        [],
        "默认范围",
        repair_exhausted=True,
    )

    assert empty.outcome == RunOutcome.NOT_FOUND
    assert empty.answer == "未找到相关内容。已查询范围：课程库"
    assert clarification.answer == "能具体说明一下要找的内容吗？可以补充关键词或指定知识库"


def test_multiple_clarification_questions_are_truncated_without_retry_issue():
    """多个澄清问题截到第一个后直接交付，不再要求重交。"""
    result = validate_answer(
        AgentFinishArgs(
            outcome="NEEDS_CLARIFICATION",
            clarification_question="你指哪门课？哪个学期？",
        ),
        [],
        "默认范围",
    )

    assert result.answer == "你指哪门课？"
    assert result.issues == []
