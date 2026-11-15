"""结构化分块器。

@author 称霸幼儿园
"""

import logging
from dataclasses import dataclass

from indexing.models import ParsedSection

logger = logging.getLogger(__name__)
MAX_SRT_WINDOW_MS = 60_000
MAX_SRT_GAP_MS = 5_000
MAX_GROUP_SOURCE_LINE_GAP = 2
CHUNKER_VERSION = "markdown-blocks-lines-srt-window-v1"


@dataclass(slots=True)
class ChunkDraft:
    """分块器中间输出条目。

    @author 称霸幼儿园
    """

    chunk_index: int
    content: str
    section_path: str | None = None
    page_no: int | None = None
    start_ms: int | None = None
    end_ms: int | None = None
    start_line: int | None = None
    end_line: int | None = None
    block_type: str = "paragraph"


def _split_long_text_with_offsets(text: str, chunk_size: int) -> list[tuple[str, int, int]]:
    """按字符上限切分文本并返回每片在原文本中的字符偏移。"""
    clean = text.strip()
    if not clean:
        return []
    if len(clean) <= chunk_size:
        return [(clean, 0, len(clean))]

    parts: list[tuple[str, int, int]] = []
    start = 0
    length = len(clean)

    while start < length:
        end = min(length, start + chunk_size)
        if end < length:
            boundary = max(
                clean.rfind("\n", start, end),
                clean.rfind("。", start, end),
                clean.rfind(".", start, end),
                clean.rfind(" ", start, end),
            )
            if boundary > start + chunk_size // 3:
                end = boundary + 1
        raw_piece = clean[start:end]
        leading = len(raw_piece) - len(raw_piece.lstrip())
        trailing = len(raw_piece.rstrip())
        piece = raw_piece[leading:trailing]
        if piece:
            parts.append((piece, start + leading, start + trailing))
        start = end
    return parts


def _source_line_range(
    text: str,
    start_offset: int,
    end_offset: int,
    source_start_line: int | None,
) -> tuple[int | None, int | None]:
    """将文本字符偏移转换成 1 起闭区间源行号。"""
    if source_start_line is None or end_offset <= start_offset:
        return None, None
    start_line = source_start_line + text[:start_offset].count("\n")
    end_line = source_start_line + text[: end_offset - 1].count("\n")
    return start_line, end_line


def _pack_timed_sections(
    sections: list[ParsedSection],
    chunk_size: int,
    start_index: int,
) -> list[ChunkDraft]:
    """按字符上限、60 秒窗口及最大相邻间隔组包字幕。"""
    drafts: list[ChunkDraft] = []
    buf: list[ParsedSection] = []
    buf_len = 0

    def flush() -> None:
        nonlocal buf_len
        if not buf:
            return
        content = "\n".join(item.text.strip() for item in buf if item.text.strip()).strip()
        if content:
            drafts.append(
                ChunkDraft(
                    chunk_index=start_index + len(drafts),
                    content=content,
                    start_ms=buf[0].start_ms,
                    end_ms=buf[-1].end_ms,
                )
            )
        buf.clear()
        buf_len = 0

    for sec in sections:
        text = sec.text.strip()
        if not text:
            continue
        sec_start = sec.start_ms if sec.start_ms is not None else 0
        sec_end = sec.end_ms if sec.end_ms is not None else sec_start
        previous_end = buf[-1].end_ms if buf else sec_start
        first_start = buf[0].start_ms if buf else sec_start
        gap_exceeded = (
            bool(buf)
            and sec_start - (previous_end if previous_end is not None else sec_start) > MAX_SRT_GAP_MS
        )
        window_exceeded = (
            bool(buf)
            and sec_end - (first_start if first_start is not None else sec_start) > MAX_SRT_WINDOW_MS
        )
        projected = buf_len + len(text) + (1 if buf else 0)
        if buf and (gap_exceeded or window_exceeded or projected > chunk_size):
            flush()
        buf.append(sec)
        buf_len += len(text) + (1 if len(buf) > 1 else 0)

    flush()
    return drafts


def _can_group_sections(previous: ParsedSection, current: ParsedSection) -> bool:
    """判断普通文本块是否属于同一章节、页码和相邻源行。

    :param previous: 前一个普通文本块
    :param current: 当前普通文本块
    :return: 是否允许合并
    """
    if (previous.section_path, previous.page_no, previous.section_start_line) != (
        current.section_path, current.page_no, current.section_start_line,
    ):
        return False
    if previous.start_ms is not None or current.start_ms is not None:
        return False
    if previous.end_line is None and current.start_line is None:
        return True
    if previous.end_line is None or current.start_line is None:
        return False
    return 0 < current.start_line - previous.end_line <= MAX_GROUP_SOURCE_LINE_GAP


def chunk_sections(
    sections: list[ParsedSection],
    chunk_size_chars: int = 600,
) -> list[ChunkDraft]:
    """按结构边界切分段落，保留章节路径、源行、页码或字幕时间区间。

    :param sections: 解析器输出段落列表
    :param chunk_size_chars: 目标分块字符上限
    :return: 有序分块列表
    """
    if not sections:
        return []

    has_timed = any(sec.start_ms is not None for sec in sections)
    if has_timed and all(sec.start_ms is not None for sec in sections):
        return _pack_timed_sections(sections, chunk_size_chars, 0)

    drafts: list[ChunkDraft] = []
    group: list[tuple[ParsedSection, ChunkDraft]] = []
    group_length = 0

    def flush_group() -> None:
        """输出同章节相邻普通文本块组成的分块。"""
        nonlocal group_length
        if not group:
            return
        first = group[0][1]
        last = group[-1][1]
        block_type = first.block_type if all(draft.block_type == first.block_type for _, draft in group) else "paragraph"
        drafts.append(
            ChunkDraft(
                chunk_index=len(drafts),
                content="\n\n".join(draft.content for _, draft in group),
                section_path=first.section_path,
                page_no=first.page_no,
                start_ms=first.start_ms,
                end_ms=last.end_ms,
                start_line=first.start_line,
                end_line=last.end_line,
                block_type=block_type,
            )
        )
        group.clear()
        group_length = 0

    for sec in sections:
        clean = sec.text.strip()
        if not clean:
            continue
        source_start_line = sec.start_line
        if source_start_line is not None:
            leading_length = len(sec.text) - len(sec.text.lstrip())
            source_start_line += sec.text[:leading_length].count("\n")
        if sec.block_type in {"code", "table"}:
            flush_group()
            if len(clean) > chunk_size_chars:
                logger.warning(
                    "Markdown 原子块超出分块字符上限 block_type=%s chars=%d limit=%d",
                    sec.block_type,
                    len(clean),
                    chunk_size_chars,
                )
            drafts.append(
                ChunkDraft(
                    chunk_index=len(drafts),
                    content=clean,
                    section_path=sec.section_path,
                    page_no=sec.page_no,
                    start_ms=sec.start_ms,
                    end_ms=sec.end_ms,
                    start_line=source_start_line,
                    end_line=source_start_line + clean.count("\n") if source_start_line is not None else None,
                    block_type=sec.block_type,
                )
            )
            continue
        if len(clean) <= chunk_size_chars:
            projected = group_length + len(clean) + (2 if group else 0)
            if group and (not _can_group_sections(group[-1][0], sec) or projected > chunk_size_chars):
                flush_group()
            group.append((sec, ChunkDraft(
                chunk_index=0,
                content=clean,
                section_path=sec.section_path,
                page_no=sec.page_no,
                start_ms=sec.start_ms,
                end_ms=sec.end_ms,
                start_line=source_start_line,
                end_line=source_start_line + clean.count("\n") if source_start_line is not None else None,
                block_type=sec.block_type,
            )))
            group_length += len(clean) + (2 if len(group) > 1 else 0)
            continue
        flush_group()
        for piece, start_offset, end_offset in _split_long_text_with_offsets(clean, chunk_size_chars):
            start_line, end_line = _source_line_range(
                clean,
                start_offset,
                end_offset,
                source_start_line,
            )
            drafts.append(
                ChunkDraft(
                    chunk_index=len(drafts),
                    content=piece,
                    section_path=sec.section_path,
                    page_no=sec.page_no,
                    start_ms=sec.start_ms,
                    end_ms=sec.end_ms,
                    start_line=start_line,
                    end_line=end_line,
                    block_type=sec.block_type,
                )
            )
    flush_group()
    return drafts
