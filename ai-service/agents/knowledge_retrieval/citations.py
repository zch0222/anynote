"""使用 Markdown 语法树识别回答引用与外部资源。

@author 称霸幼儿园
"""

import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

from markdown_it import MarkdownIt
from markdown_it.rules_block import StateBlock
from markdown_it.rules_inline import StateInline

CITATION_GROUP_PATTERN = re.compile(r"^(?:\[\d+\])+")
CITATION_ITEM_PATTERN = re.compile(r"\[(\d+)\]")
CITATION_INDEX_PATTERN = re.compile(r"^[1-9]\d{0,2}$")
ASCII_PREFIX_PATTERN = re.compile(r"[A-Za-z0-9_]")
INLINE_MATH_PATTERN = re.compile(r"^\$(?!\$)([^$\n]+?)\$(?!\$)")
BLOCK_MATH_LINE_PATTERN = re.compile(r"^\$\$(.+?)\$\$\s*$")
EXCLUDED = "_citation_excluded"


@dataclass(frozen=True)
class AnswerScan:
    """一次回答解析得到的引用与外部资源统计。

    @author 称霸幼儿园
    """

    indices: list[int]
    excluded_candidates: int = 0
    external_link_count: int = 0
    external_image_count: int = 0
    external_hosts: list[str] = field(default_factory=list)

    def trace_attributes(self) -> dict[str, Any]:
        """返回写入验证 Trace 的统计数据。

        :return: 不含回答正文与 URL 查询参数的属性
        """
        return {
            "citationCandidatesExcluded": self.excluded_candidates,
            "externalLinks": self.external_link_count,
            "externalImages": self.external_image_count,
            "externalHosts": list(self.external_hosts),
        }


def _valid_index(raw: str) -> int | None:
    if not CITATION_INDEX_PATTERN.fullmatch(raw):
        return None
    index = int(raw)
    return index if 1 <= index <= 999 else None


def _citation_rule(state: StateInline, silent: bool) -> bool:
    if silent:
        return False
    match = CITATION_GROUP_PATTERN.match(state.src[state.pos : state.posMax])
    if not match:
        return False
    if state.linkLevel > 0:
        state.env[EXCLUDED] = state.env.get(EXCLUDED, 0) + 1
        return False

    source = match.group(0)
    previous = state.src[state.pos - 1] if state.pos > 0 else ""
    items = list(CITATION_ITEM_PATTERN.finditer(source))
    first = items[0].group(1)
    after_pos = state.pos + len(source)
    after = state.src[after_pos] if after_pos < state.posMax else ""

    if len(items) == 1:
        if after in {"(", "["}:
            state.env[EXCLUDED] = state.env.get(EXCLUDED, 0) + 1
            return False
        references = state.env.get("references", {})
        if first.upper() in references:
            state.env[EXCLUDED] = state.env.get(EXCLUDED, 0) + 1
            return False

    if previous and (ASCII_PREFIX_PATTERN.fullmatch(previous) or previous == "["):
        state.env[EXCLUDED] = state.env.get(EXCLUDED, 0) + len(items)
        state.pending += source
        state.pos += len(source)
        return True

    for item in items:
        raw = item.group(1)
        index = _valid_index(raw)
        if index is None:
            state.pending += item.group(0)
            continue
        token = state.push("ai_citation", "span", 0)
        token.content = item.group(0)
        token.meta = {"index": index}
    state.pos += len(source)
    return True


def _math_inline_rule(state: StateInline, silent: bool) -> bool:
    match = INLINE_MATH_PATTERN.match(state.src[state.pos : state.posMax])
    if not match:
        return False
    if not silent:
        token = state.push("anynote_math_inline", "", 0)
        token.content = match.group(0)
        token.meta = {"latex": match.group(1).strip()}
    state.pos += len(match.group(0))
    return True


def _math_block_rule(state: StateBlock, start_line: int, end_line: int, silent: bool) -> bool:
    start = state.bMarks[start_line] + state.tShift[start_line]
    maximum = state.eMarks[start_line]
    first = state.src[start:maximum]
    if not first.startswith("$$"):
        return False
    if silent:
        return True

    latex = ""
    next_line = start_line + 1
    single = BLOCK_MATH_LINE_PATTERN.match(first)
    if single and single.group(1).strip():
        latex = single.group(1).strip()
    else:
        parts = []
        rest = first[2:].strip()
        if rest:
            parts.append(rest)
        closed = False
        while next_line < end_line:
            line_start = state.bMarks[next_line] + state.tShift[next_line]
            line_end = state.eMarks[next_line]
            line = state.src[line_start:line_end]
            if line.strip() == "$$":
                closed = True
                next_line += 1
                break
            parts.append(line)
            next_line += 1
        if not closed:
            return False
        latex = "\n".join(parts).strip()

    token = state.push("anynote_math_block", "div", 0)
    token.content = latex
    token.meta = {"latex": latex}
    token.map = [start_line, next_line]
    state.line = next_line
    return True


def _parser() -> MarkdownIt:
    parser = MarkdownIt("commonmark", {"html": False, "linkify": True}).enable(
        ["table", "strikethrough", "linkify"]
    )
    parser.block.ruler.before("fence", "anynote_math_block", _math_block_rule)
    parser.inline.ruler.before("strikethrough", "anynote_math_inline", _math_inline_rule)
    parser.inline.ruler.before("strikethrough", "ai_citation", _citation_rule)
    return parser


PARSER = _parser()


def _is_external_target(target: str) -> bool:
    parsed = urlparse(target)
    return bool(parsed.scheme or parsed.netloc or target.lower().startswith("www."))


def _external_host(target: str) -> str | None:
    if not _is_external_target(target):
        return None
    return urlparse(target).hostname or None


def _walk(tokens, scan: dict[str, Any]) -> None:
    for token in tokens:
        target = None
        kind = None
        if token.type == "link_open":
            target = token.attrGet("href")
            kind = "external_link_count"
        elif token.type == "image":
            target = token.attrGet("src")
            kind = "external_image_count"
        if target and kind and _is_external_target(target):
            scan[kind] += 1
            host = _external_host(target)
            if host and host not in scan["external_hosts"]:
                scan["external_hosts"].append(host)
        if token.children:
            _walk(token.children, scan)


def scan_answer(text: str) -> AnswerScan:
    """解析回答并返回引用编号、排除候选数及外部资源统计。

    :param text: Agent 普通回答的 Markdown 原文
    :return: 按出现顺序排列的解析结果
    """
    env: dict[str, Any] = {}
    tokens = PARSER.parse(text, env)
    indices = []

    def collect(children) -> None:
        for token in children:
            if token.type == "ai_citation":
                indices.append(int(token.meta["index"]))
            if token.children:
                collect(token.children)

    collect(tokens)
    resources: dict[str, Any] = {
        "external_link_count": 0,
        "external_image_count": 0,
        "external_hosts": [],
    }
    _walk(tokens, resources)
    return AnswerScan(
        indices=indices,
        excluded_candidates=int(env.get(EXCLUDED, 0)),
        external_link_count=resources["external_link_count"],
        external_image_count=resources["external_image_count"],
        external_hosts=resources["external_hosts"],
    )
