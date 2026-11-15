"""结构化分块器。

@author 称霸幼儿园
"""

from dataclasses import dataclass

from indexing.models import ParsedSection


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


def _split_long_text(text: str, chunk_size: int) -> list[str]:
    clean = text.strip()
    if not clean:
        return []
    if len(clean) <= chunk_size:
        return [clean]

    parts: list[str] = []
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
        piece = clean[start:end].strip()
        if piece:
            parts.append(piece)
        start = end
    return parts


def _pack_timed_sections(
    sections: list[ParsedSection],
    chunk_size: int,
    start_index: int,
) -> list[ChunkDraft]:
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
        if len(text) > chunk_size:
            flush()
            for piece in _split_long_text(text, chunk_size):
                drafts.append(
                    ChunkDraft(
                        chunk_index=start_index + len(drafts),
                        content=piece,
                        start_ms=sec.start_ms,
                        end_ms=sec.end_ms,
                    )
                )
            continue
        projected = buf_len + len(text) + (1 if buf else 0)
        if buf and projected > chunk_size:
            flush()
        buf.append(sec)
        buf_len += len(text) + (1 if len(buf) > 1 else 0)

    flush()
    return drafts


def chunk_sections(
    sections: list[ParsedSection],
    chunk_size_chars: int = 600,
) -> list[ChunkDraft]:
    """按结构边界切分段落，片段之间不重叠，保留章节路径、页码或字幕时间区间。

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
    for sec in sections:
        for piece in _split_long_text(sec.text, chunk_size_chars):
            drafts.append(
                ChunkDraft(
                    chunk_index=len(drafts),
                    content=piece,
                    section_path=sec.section_path,
                    page_no=sec.page_no,
                    start_ms=sec.start_ms,
                    end_ms=sec.end_ms,
                )
            )
    return drafts
