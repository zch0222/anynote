"""SRT 字幕解析器。

@author 称霸幼儿园
"""

import re

from indexing.models import ParsedDocument, ParsedSection
from indexing.parsers.plain_text import parse_plain_text

_TIME_RE = re.compile(
    r"(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})"
)
_TAG_RE = re.compile(r"<[^>]+>")


def _to_ms(hours: str | None, minutes: str, seconds: str, millis: str) -> int:
    return ((int(hours or 0) * 60 + int(minutes)) * 60 + int(seconds)) * 1000 + int(millis)


def parse_srt(text: str) -> ParsedDocument:
    """解析 SRT 字幕并保留起止毫秒时间戳。

    :param text: SRT 字幕全文
    :return: 含时间范围的段落序列
    """
    if not text or not text.strip():
        return ParsedDocument(sections=[])

    normalized = text.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")
    blocks = re.split(r"\n\s*\n", normalized.strip())
    sections: list[ParsedSection] = []

    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines:
            continue
        time_idx = next((idx for idx, line in enumerate(lines) if _TIME_RE.search(line)), -1)
        if time_idx < 0:
            continue
        match = _TIME_RE.search(lines[time_idx])
        assert match is not None
        start_ms = _to_ms(match.group(1), match.group(2), match.group(3), match.group(4))
        end_ms = _to_ms(match.group(5), match.group(6), match.group(7), match.group(8))
        cue_text = " ".join(_TAG_RE.sub("", line).strip() for line in lines[time_idx + 1 :]).strip()
        if cue_text:
            sections.append(ParsedSection(text=cue_text, start_ms=start_ms, end_ms=end_ms))

    if not sections:
        return parse_plain_text(normalized)
    return ParsedDocument(sections=sections)
