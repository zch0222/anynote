"""正文拼接、续读偏移与字面查找等纯文本工具。

@author 称霸幼儿园
"""

import re
from dataclasses import dataclass

_NOTE_LINK_RE = re.compile(r"(?:https?://[^\s()<>\]]+)?/(?:m/)?notes/(\d+)/(\d+)(?![\d/])")


@dataclass(slots=True)
class GrepHit:
    """一处字面命中及其上下文。

    @author 称霸幼儿园
    """

    line_no: int
    start_line: int
    end_line: int
    text: str
    page_no: int | None = None


def utf16_length(text: str) -> int:
    """按 Java 字符（UTF-16 码元）计算长度，用于 note 的续读偏移。

    :param text: 文本
    :return: UTF-16 码元数
    """
    return len(text.encode("utf-16-le")) // 2


def take_chars(text: str, limit: int) -> tuple[str, bool]:
    """截取不超过 limit 个字符。

    :param text: 原文
    :param limit: 上限
    :return: （截取结果, 是否被截断）
    """
    if len(text) <= limit:
        return text, False
    return text[:limit], True


def grep_lines(
    lines: list[str],
    pattern: str,
    ignore_case: bool,
    context: int,
    max_hits: int,
    pages: list[int | None] | None = None,
) -> tuple[list[GrepHit], bool]:
    """在行列表中查找字面字符串，返回命中行号（从 1 起）与前后若干行。

    :param lines: 文本行
    :param pattern: 字面字符串
    :param ignore_case: 是否忽略大小写
    :param context: 前后上下文行数
    :param max_hits: 最多命中数
    :param pages: 与行对应的页码，可为空
    :return: （命中列表, 是否因达到上限而截断）
    """
    needle = pattern.lower() if ignore_case else pattern
    hits: list[GrepHit] = []
    for index, line in enumerate(lines):
        haystack = line.lower() if ignore_case else line
        if needle not in haystack:
            continue
        if len(hits) >= max_hits:
            return hits, True
        start = max(0, index - context)
        end = min(len(lines) - 1, index + context)
        hits.append(
            GrepHit(
                line_no=index + 1,
                start_line=start + 1,
                end_line=end + 1,
                text="\n".join(lines[start : end + 1]),
                page_no=pages[index] if pages else None,
            )
        )
    return hits, False


def extract_note_links(content: str) -> list[tuple[int, int]]:
    """解析正文中指向笔记页面的站内链接（桌面 /notes/{库}/{笔记} 与移动 /m/notes/{库}/{笔记}）。

    :param content: Markdown 正文
    :return: 去重后的（知识库 id, 笔记 id）
    """
    result: list[tuple[int, int]] = []
    for match in _NOTE_LINK_RE.finditer(content or ""):
        pair = (int(match.group(1)), int(match.group(2)))
        if pair not in result:
            result.append(pair)
    return result
