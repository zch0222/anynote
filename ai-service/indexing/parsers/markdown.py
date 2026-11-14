"""Markdown 文档解析器。

@author 称霸幼儿园
"""

import re

from indexing.models import ParsedDocument, ParsedSection

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
_FENCE_RE = re.compile(r"^\s*(```|~~~)")


def parse_markdown(text: str) -> ParsedDocument:
    """解析 Markdown 正文并跟踪标题层级路径。

    :param text: Markdown 原文
    :return: 包含章节路径的解析结果
    """
    if not text or not text.strip():
        return ParsedDocument(sections=[])

    sections: list[ParsedSection] = []
    heading_stack: list[tuple[int, str]] = []
    buffer: list[str] = []
    in_fence = False

    def flush() -> None:
        chunk_text = "\n".join(buffer).strip()
        buffer.clear()
        if not chunk_text:
            return
        path = " / ".join(title for _, title in heading_stack) or None
        sections.append(ParsedSection(text=chunk_text, section_path=path))

    for raw_line in text.replace("\r\n", "\n").replace("\r", "\n").splitlines():
        if _FENCE_RE.match(raw_line):
            in_fence = not in_fence
            buffer.append(raw_line)
            continue
        if not in_fence:
            match = _HEADING_RE.match(raw_line)
            if match:
                flush()
                level = len(match.group(1))
                title = match.group(2).strip()
                while heading_stack and heading_stack[-1][0] >= level:
                    heading_stack.pop()
                heading_stack.append((level, title))
                continue
        buffer.append(raw_line)

    flush()
    return ParsedDocument(sections=sections)
