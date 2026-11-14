"""纯文本文档解析器。

@author 称霸幼儿园
"""

import re

from indexing.models import ParsedDocument, ParsedSection

_BLANK_LINES_RE = re.compile(r"\n{3,}")


def parse_plain_text(text: str) -> ParsedDocument:
    """规范化纯文本内容并生成段落结构。

    :param text: 原始纯文本
    :return: 解析结果
    """
    if not text or not text.strip():
        return ParsedDocument(sections=[])
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    normalized = _BLANK_LINES_RE.sub("\n\n", normalized).strip()
    if not normalized:
        return ParsedDocument(sections=[])
    return ParsedDocument(sections=[ParsedSection(text=normalized)])
