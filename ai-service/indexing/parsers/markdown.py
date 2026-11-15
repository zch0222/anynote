"""Markdown 文档解析器。

@author 称霸幼儿园
"""

import re

from indexing.models import ParsedDocument, ParsedSection

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
_FENCE_OPEN_RE = re.compile(r"^\s*(`{3,}|~{3,})")
_FENCE_CLOSE_RE = re.compile(r"^\s*(`{3,}|~{3,})\s*$")
_TABLE_SEPARATOR_RE = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$")
_LIST_RE = re.compile(r"^\s*(?:[-+*]|\d+[.)])\s+\S")
_IMAGE_RE = re.compile(r"^\s*!\[(?:\\.|[^\]\\])*\](?:\(.+\)|\[[^\]]*\])\s*$")


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
    buffer_start = 0
    section_start_line: int | None = None

    def section_path() -> str | None:
        return " / ".join(title for _, title in heading_stack) or None

    def flush_paragraph(end_line: int) -> None:
        """写入当前普通文本块及其源行范围。"""
        nonlocal buffer_start
        chunk_text = "\n".join(buffer).strip()
        buffer.clear()
        if not chunk_text:
            return
        sections.append(
            ParsedSection(
                text=chunk_text,
                section_path=section_path(),
                start_line=buffer_start,
                end_line=end_line,
                section_start_line=section_start_line,
                block_type="paragraph",
            )
        )

    lines = text.replace("\r\n", "\n").replace("\r", "\n").splitlines()
    index = 0
    while index < len(lines):
        raw_line = lines[index]
        line_number = index + 1
        fence_match = _FENCE_OPEN_RE.match(raw_line)
        if fence_match:
            flush_paragraph(line_number - 1)
            fence = fence_match.group(1)
            fence_char = fence[0]
            fence_length = len(fence)
            start = index
            block_lines = [raw_line]
            index += 1
            while index < len(lines):
                block_lines.append(lines[index])
                close_match = _FENCE_CLOSE_RE.match(lines[index])
                index += 1
                if close_match and close_match.group(1)[0] == fence_char and len(close_match.group(1)) >= fence_length:
                    break
            sections.append(
                ParsedSection(
                    text="\n".join(block_lines).strip(),
                    section_path=section_path(),
                    start_line=start + 1,
                    end_line=index,
                    section_start_line=section_start_line,
                    block_type="code",
                )
            )
            continue

        match = _HEADING_RE.match(raw_line)
        if match:
            flush_paragraph(line_number - 1)
            level = len(match.group(1))
            title = match.group(2).strip()
            while heading_stack and heading_stack[-1][0] >= level:
                heading_stack.pop()
            heading_stack.append((level, title))
            section_start_line = line_number
            index += 1
            continue

        if index + 1 < len(lines) and "|" in raw_line and _TABLE_SEPARATOR_RE.match(lines[index + 1]):
            flush_paragraph(line_number - 1)
            start = index
            table_lines = [raw_line, lines[index + 1]]
            index += 2
            while index < len(lines) and lines[index].strip() and "|" in lines[index]:
                table_lines.append(lines[index])
                index += 1
            sections.append(
                ParsedSection(
                    text="\n".join(table_lines).strip(),
                    section_path=section_path(),
                    start_line=start + 1,
                    end_line=start + len(table_lines),
                    section_start_line=section_start_line,
                    block_type="table",
                )
            )
            continue

        if _LIST_RE.match(raw_line):
            flush_paragraph(line_number - 1)
            start = index
            list_lines = [raw_line]
            index += 1
            while index < len(lines):
                candidate = lines[index]
                if not candidate.strip() or _FENCE_OPEN_RE.match(candidate):
                    break
                if not _LIST_RE.match(candidate) and not candidate.startswith(("  ", "\t")):
                    break
                list_lines.append(candidate)
                index += 1
            sections.append(
                ParsedSection(
                    text="\n".join(list_lines).strip(),
                    section_path=section_path(),
                    start_line=start + 1,
                    end_line=index,
                    section_start_line=section_start_line,
                    block_type="list",
                )
            )
            continue

        if _IMAGE_RE.match(raw_line):
            flush_paragraph(line_number - 1)
            sections.append(
                ParsedSection(
                    text=raw_line.strip(),
                    section_path=section_path(),
                    start_line=line_number,
                    end_line=line_number,
                    section_start_line=section_start_line,
                    block_type="image",
                )
            )
            index += 1
            continue

        if not raw_line.strip():
            flush_paragraph(line_number - 1)
            index += 1
            continue
        if not buffer:
            buffer_start = line_number
        buffer.append(raw_line)
        index += 1

    flush_paragraph(len(lines))
    return ParsedDocument(sections=sections)
