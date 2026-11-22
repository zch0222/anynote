"""知识检索 Agent 契约、引用验证与回答原文测试。

@author 称霸幼儿园
"""

import pytest

from agents import load_agent
from agents.knowledge_retrieval.agent import AgentFinishArgs, CitationQuote
from agents.knowledge_retrieval.response import validate_answer
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


def test_knowledge_retrieval_agent_loads_three_files_and_eight_tools():
    """加载契约、指令、上下文策略与只读工具名。"""
    agent = load_agent("knowledge-retrieval")

    assert agent.name == "knowledge-retrieval"
    assert agent.version == "4"
    assert agent.terminal_tool == "agent_finish"
    assert agent.tools == list(KNOWLEDGE_TOOL_NAMES)
    assert agent.context_policy["evidence_trust_level"] == "UNTRUSTED_CONTENT"
    assert "agent_finish" in agent.instructions


def test_instructions_route_catalog_questions_and_explain_citable_rows():
    """指令按问题类型分派全部八个工具，并说明哪些结果可引用、回答写在哪里。"""
    instructions = load_agent("knowledge-retrieval").instructions

    for name in KNOWLEDGE_TOOL_NAMES:
        assert name in instructions
    assert "我有哪些知识库" in instructions
    assert "evidenceId" in instructions
    assert "引用只写 [1] 这种数字形式，不要写成 [E1]" in instructions
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
    assert invalid.answer == "结论[2]"
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


def test_answer_preserves_code_links_images_and_question_marks():
    """普通回答只裁掉首尾空白，不删改代码、链接、图片或问号。"""
    answer = (
        "代码：`requests.get(\"https://example.com/api\")` 与 `String?`\n\n"
        "```html\n<a href=\"https://example.com\"><b>首页</b></a>\n```\n\n"
        "[外链](https://example.com) ![图片](//example.com/a.png) www.python.org"
    )

    result = validate_answer(
        AgentFinishArgs(outcome="ANSWERED", answer=f"  {answer}\n"),
        [],
        "默认范围",
    )

    assert result.answer == answer
    assert result.issues == []


def test_inline_code_subscript_does_not_count_as_citation():
    """行内代码下标不算引用，有证据时仍报告缺失来源。"""
    result = validate_answer(
        AgentFinishArgs(outcome="ANSWERED", answer="取第二个元素用 `arr[1]`。"),
        [_evidence()],
        "课程库",
        tool_calls=1,
    )

    assert result.answer == "取第二个元素用 `arr[1]`。"
    assert result.citations == []
    assert [issue.code for issue in result.issues] == ["MISSING_CITATION"]


def test_clarification_terminal_contract_is_removed():
    """终态工具不再接受专用澄清结果或澄清问题字段。"""
    with pytest.raises(ValueError):
        AgentFinishArgs.model_validate(
            {"outcome": "NEEDS_CLARIFICATION", "clarification_question": "你指哪门课？"}
        )

    schema = AgentFinishArgs.model_json_schema()
    assert "clarification_question" not in schema["properties"]
    assert set(schema["properties"]["outcome"]["enum"]) == {"ANSWERED", "NOT_FOUND"}


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
    assert degraded.answer == "结论[2]"
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
    """正文引用未附原文时只核对编号，检索片段保留资料原有标签。"""
    evidence = _evidence().model_copy(
        update={"retrieval": {"highlight": "<em>可核对</em>的原文片段。"}}
    )
    result = validate_answer(
        AgentFinishArgs(outcome="ANSWERED", answer="结论[1]"),
        [evidence],
        "课程库",
    )

    assert result.issues == []
    assert result.citations[0][2] == "<em>可核对</em>的原文片段。"


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


def test_empty_answer_has_confirmed_not_found_fallback():
    """修复后空回答仍使用既有未找到结果。"""
    empty = validate_answer(
        AgentFinishArgs(outcome="ANSWERED", answer=""),
        [_evidence()],
        "课程库",
        repair_exhausted=True,
    )

    assert empty.outcome == RunOutcome.NOT_FOUND
    assert empty.answer == "未找到相关内容。已查询范围：课程库"


def test_conversation_without_tools_skips_citation_validation():
    """无证据且未调用工具时保留编号写法，不报告引用缺口。"""
    result = validate_answer(
        AgentFinishArgs(outcome="ANSWERED", answer="数组示例 arr[1]，文字编号[2]"),
        [],
        "默认范围",
        tool_calls=0,
    )

    assert result.answer == "数组示例 arr[1]，文字编号[2]"
    assert result.citations == []
    assert result.issues == []
    assert result.answer_notices == ["NOT_FROM_KNOWLEDGE"]
