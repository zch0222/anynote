"""知识检索回答的引用核验与输出过滤。

@author 称霸幼儿园
"""

import re
from dataclasses import dataclass
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


@dataclass(frozen=True)
class ValidatedAnswer:
    """已过滤的回答、结果类型、引用与验证缺口。

    引用三元组为（编号, 证据, 来源片段）：正文类证据的片段是核对过的原文，
    结构化行的片段是服务端生成的摘要，可为空。

    @author 称霸幼儿园
    """

    outcome: RunOutcome
    answer: str
    citations: list[tuple[int, EvidenceItem, str | None]]
    issues: list[str]


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
) -> ValidatedAnswer:
    """核对 Agent 终态、引用编号及引用原文。

    回答只取自终态信号的 ``answer``，助手正文不参与。正文类证据要求引用片段逐字出现在证据里；
    清单、目录、关系结果（结构化行）只核对编号，来源片段改用服务端摘要。

    :param signal: 结构化终态信号
    :param evidence: 本次运行内已授权证据
    :param scope_summary: 检索范围摘要
    :return: 已核对的回答
    """
    if signal.outcome == "NOT_FOUND" or (signal.outcome == "ANSWERED" and not evidence):
        return ValidatedAnswer(
            outcome=RunOutcome.NOT_FOUND,
            answer=f"未找到相关内容。已查询范围：{scope_summary or '默认范围'}",
            citations=[],
            issues=[],
        )

    if signal.outcome == "NEEDS_CLARIFICATION":
        question = (signal.clarification_question or "").strip()
        issues = []
        terminators = list(re.finditer(r"[?？]", question))
        if len(terminators) > 1:
            question = question[: terminators[0].end()].strip()
            issues.append("MULTIPLE_CLARIFICATION_QUESTIONS")
        if not question:
            issues.append("MISSING_CLARIFICATION_QUESTION")
        return ValidatedAnswer(
            outcome=RunOutcome.NEEDS_CLARIFICATION,
            answer=filter_external_links_and_images(question),
            citations=[],
            issues=issues,
        )

    clean_text = filter_external_links_and_images(signal.answer or "")
    evidence_by_id = {item.evidence_id: item for item in evidence}
    quotes = {item.index: item.quote for item in signal.citations}
    seen: set[int] = set()
    citations: list[tuple[int, EvidenceItem, str | None]] = []
    invalid: set[int] = set()
    issues: list[str] = []

    for index, quote in quotes.items():
        item = evidence_by_id.get(f"E{index}")
        if item is None or (not item.structured and quote not in item.content):
            invalid.add(index)

    for match in CITATION_PATTERN.finditer(clean_text):
        index = int(match.group(1))
        item = evidence_by_id.get(f"E{index}")
        if item is None:
            invalid.add(index)
            continue
        if item.structured:
            snippet = item.content or None
        else:
            snippet = quotes.get(index)
            if not snippet or snippet not in item.content:
                invalid.add(index)
                continue
        if index not in seen:
            citations.append((index, item, snippet))
            seen.add(index)

    if invalid:
        issues.append("INVALID_CITATION")
        clean_text = CITATION_PATTERN.sub(
            lambda match: "" if int(match.group(1)) in invalid else match.group(0),
            clean_text,
        ).strip()
    if not citations:
        issues.append("MISSING_VALID_CITATION")
    if not clean_text:
        issues.append("EMPTY_ANSWER")

    return ValidatedAnswer(
        outcome=RunOutcome.ANSWERED,
        answer=clean_text,
        citations=citations,
        issues=issues,
    )
