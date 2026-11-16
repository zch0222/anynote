"""知识检索回答的引用核验与输出过滤。

@author 称霸幼儿园
"""

import re
from dataclasses import dataclass, field
from urllib.parse import urlparse

from harness.models import EvidenceItem, RunOutcome

from agents.knowledge_retrieval.agent import AgentFinishArgs

CITATION_PATTERN = re.compile(r"(?<!\\)\[(\d+)\]")
IMAGE_PATTERN = re.compile(
    r"!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])|<img\b[^>]*>", re.IGNORECASE
)
MARKDOWN_LINK_PATTERN = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
HTML_ANCHOR_PATTERN = re.compile(
    r"<a\b[^>]*href\s*=\s*(['\"])(.*?)\1[^>]*>(.*?)</a\s*>",
    re.IGNORECASE | re.DOTALL,
)
ANGLE_URL_PATTERN = re.compile(r"(?i)<(?:https?://|www\.)[^>]+>")
RAW_URL_PATTERN = re.compile(r"(?i)(?:https?://|www\.)[^\s<>]+")
HIGHLIGHT_TAG_PATTERN = re.compile(r"</?em>", re.IGNORECASE)
DEFAULT_CLARIFICATION_QUESTION = "能具体说明一下要找的内容吗？可以补充关键词或指定知识库"


@dataclass(frozen=True)
class ValidationGap:
    """一项可修复的回答校验缺口。

    @author 称霸幼儿园
    """

    code: str
    detail: str
    indices: list[int] = field(default_factory=list)
    repairable: bool = True


@dataclass(frozen=True)
class ValidatedAnswer:
    """已过滤的回答、结果类型、引用、验证缺口与回答标注。

    @author 称霸幼儿园
    """

    outcome: RunOutcome
    answer: str
    citations: list[tuple[int, EvidenceItem, str | None]]
    issues: list[ValidationGap]
    answer_notices: list[str] = field(default_factory=list)


def filter_external_links_and_images(text: str) -> str:
    """移除图片、外链目标与裸外部 URL，保留内部链接文字。

    :param text: Agent 输出
    :return: 过滤后的 Markdown 文本
    """
    filtered = IMAGE_PATTERN.sub("", text)

    def keep_internal_link(match: re.Match[str]) -> str:
        target = match.group(2).strip().strip("<>")
        parsed = urlparse(target)
        external = bool(parsed.scheme or target.startswith("//") or target.lower().startswith("www."))
        return match.group(1) if external else match.group(0)

    filtered = MARKDOWN_LINK_PATTERN.sub(keep_internal_link, filtered)

    def keep_internal_anchor(match: re.Match[str]) -> str:
        target = match.group(2).strip()
        parsed = urlparse(target)
        if parsed.scheme or target.startswith("//") or target.lower().startswith("www."):
            return re.sub(r"<[^>]+>", "", match.group(3))
        return match.group(0)

    filtered = HTML_ANCHOR_PATTERN.sub(keep_internal_anchor, filtered)
    filtered = ANGLE_URL_PATTERN.sub("", filtered)
    filtered = RAW_URL_PATTERN.sub("", filtered)
    return filtered.strip()


def validate_answer(
    signal: AgentFinishArgs,
    evidence: list[EvidenceItem],
    scope_summary: str | None,
    tool_calls: int = 0,
    repair_exhausted: bool = False,
) -> ValidatedAnswer:
    """核对回答、引用编号及可选原文，并在修复耗尽后按缺口降级。

    :param signal: 结构化终态信号或纯文本完成申请
    :param evidence: 本次运行内已授权证据
    :param scope_summary: 检索范围摘要
    :param tool_calls: 本次运行已执行的工具调用数
    :param repair_exhausted: 是否已用过唯一一次修复机会
    :return: 已核对的回答与降级标注
    """
    if signal.outcome == "NOT_FOUND":
        return ValidatedAnswer(
            outcome=RunOutcome.NOT_FOUND,
            answer=_not_found_answer(scope_summary),
            citations=[],
            issues=[],
        )

    if signal.outcome == "NEEDS_CLARIFICATION":
        question = filter_external_links_and_images((signal.clarification_question or "").strip())
        terminators = list(re.finditer(r"[?？]", question))
        if len(terminators) > 1:
            question = question[: terminators[0].end()].strip()
        issues = []
        if not question:
            issues.append(
                ValidationGap(
                    code="MISSING_CLARIFICATION_QUESTION",
                    detail="需澄清但没有提供问题",
                )
            )
            if repair_exhausted:
                question = DEFAULT_CLARIFICATION_QUESTION
        return ValidatedAnswer(
            outcome=RunOutcome.NEEDS_CLARIFICATION,
            answer=question,
            citations=[],
            issues=issues,
        )

    clean_text = filter_external_links_and_images(signal.answer or "")
    evidence_by_id = {item.evidence_id: item for item in evidence}
    quotes = {item.index: item.quote for item in signal.citations}
    seen: set[int] = set()
    citations: list[tuple[int, EvidenceItem, str | None]] = []
    invalid: set[int] = set()
    invalid_details: list[str] = []
    issues: list[ValidationGap] = []

    for match in CITATION_PATTERN.finditer(clean_text):
        index = int(match.group(1))
        item = evidence_by_id.get(f"E{index}")
        if item is None:
            invalid.add(index)
            continue
        quote = quotes.get(index, "")
        if not item.structured and quote and quote not in item.content:
            invalid.add(index)
            continue
        if index not in seen:
            snippet = item.content or None if item.structured else _highlight_snippet(item)
            citations.append((index, item, snippet))
            seen.add(index)

    if invalid:
        clean_text = CITATION_PATTERN.sub(
            lambda match: "" if int(match.group(1)) in invalid else match.group(0),
            clean_text,
        ).strip()
        for index in sorted(invalid):
            if f"E{index}" not in evidence_by_id:
                invalid_details.append(f"[{index}] 对应的证据 E{index} 不存在")
            else:
                invalid_details.append(f"[{index}] 附的原文没有出现在证据 E{index} 里")
        issues.append(
            ValidationGap(
                code="INVALID_CITATION",
                detail="；".join(invalid_details),
                indices=sorted(invalid),
            )
        )

    if not evidence and tool_calls > 0:
        return ValidatedAnswer(
            outcome=RunOutcome.NOT_FOUND,
            answer=_not_found_answer(scope_summary),
            citations=[],
            issues=[],
        )

    if evidence and not citations:
        issues.append(
            ValidationGap(
                code="MISSING_CITATION",
                detail="回答用到了工具结果，但没有标注来源",
            )
        )
    if not clean_text:
        issues.append(ValidationGap(code="EMPTY_ANSWER", detail="过滤后正文为空"))
    if not clean_text and repair_exhausted:
        return ValidatedAnswer(
            outcome=RunOutcome.NOT_FOUND,
            answer=_not_found_answer(scope_summary),
            citations=[],
            issues=issues,
        )

    answer_notices = []
    if not evidence and tool_calls == 0:
        answer_notices.append("NOT_FROM_KNOWLEDGE")
    if repair_exhausted:
        if evidence and not citations:
            answer_notices.insert(0, "UNSOURCED")
        if invalid:
            answer_notices.append("CITATIONS_REMOVED")

    return ValidatedAnswer(
        outcome=RunOutcome.ANSWERED,
        answer=clean_text,
        citations=citations,
        issues=issues,
        answer_notices=answer_notices,
    )


def _highlight_snippet(item: EvidenceItem) -> str | None:
    """取出去除检索高亮标签的来源片段。"""
    highlight = (item.retrieval or {}).get("highlight")
    if not isinstance(highlight, str) or not highlight:
        return None
    return HIGHLIGHT_TAG_PATTERN.sub("", highlight)


def _not_found_answer(scope_summary: str | None) -> str:
    """生成既有未找到结果文案。"""
    return f"未找到相关内容。已查询范围：{scope_summary or '默认范围'}"
