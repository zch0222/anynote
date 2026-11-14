"""源文档解析器注册表。

@author 称霸幼儿园
"""

from indexing.models import ParsedDocument, SourceDocument
from indexing.parsers.markdown import parse_markdown
from indexing.parsers.pdf import parse_pdf_bytes
from indexing.parsers.plain_text import parse_plain_text
from indexing.parsers.srt import parse_srt


def parse_document_text(document: SourceDocument) -> ParsedDocument:
    """按文档格式解析文本类源文档。

    :param document: 源文档对象
    :return: 结构化解析结果
    """
    fmt = (document.format or "plain").strip().lower()
    body = document.body or ""
    if fmt in {"markdown", "md"}:
        return parse_markdown(body)
    if fmt == "srt":
        return parse_srt(body)
    return parse_plain_text(body)


__all__ = ["parse_document_text", "parse_markdown", "parse_pdf_bytes", "parse_plain_text", "parse_srt"]
