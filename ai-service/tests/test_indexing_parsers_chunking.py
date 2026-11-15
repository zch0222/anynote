"""源文档解析与分块器单元测试。

@author 称霸幼儿园
"""

import io
import time

import pytest
from pypdf import PdfWriter

from indexing.chunking import chunk_sections
from indexing.models import PDF_PARSE_LIMIT_MESSAGE, SCANNED_PDF_MESSAGE, SourceDocument
from indexing.parsers import markdown, parse_document_text, plain_text, srt
from indexing.parsers.pdf import PdfParseLimitError, extract_pdf_sections_sync


def _make_blank_pdf_bytes() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _make_text_pdf_bytes(text: str) -> bytes:
    # 构造极简带标准 Helvetica 字体的合法 PDF 流，无需额外图形依赖
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 12 Tf 36 160 Td ({escaped}) Tj ET".encode("latin1")
    objs = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
        f"5 0 obj << /Length {len(stream)} >> stream\n".encode("latin1") + stream + b"\nendstream endobj\n",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for obj in objs:
        offsets.append(len(out))
        out.extend(obj)
    xref_pos = len(out)
    out.extend(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode("latin1"))
    for off in offsets:
        out.extend(f"{off:010d} 00000 n \n".encode("latin1"))
    out.extend(
        f"trailer << /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("latin1")
    )
    return bytes(out)


def test_markdown_tracks_section_path_and_ignores_code_fences():
    """Markdown 解析器追踪层级标题并忽略代码块中的井号行。"""
    md = (
        "# 总览\n介绍正文。\n\n"
        "## 子节\n```python\n# 不是标题\nprint(1)\n```\n详情。"
    )
    parsed = markdown.parse_markdown(md)
    assert len(parsed.sections) == 2
    assert parsed.sections[0].section_path == "总览"
    assert parsed.sections[1].section_path == "总览 / 子节"
    assert "# 不是标题" in parsed.sections[1].text


def test_srt_parser_and_chunk_preserve_ms_range():
    """SRT 字幕分块正确合并相邻字幕并保留首尾毫秒区间。"""
    subtitle = (
        "1\n00:00:01,250 --> 00:00:04,500\n<b>你好</b>同学\n\n"
        "2\n00:00:05,000 --> 00:00:08,100\n今天讲知识索引\n"
    )
    parsed = srt.parse_srt(subtitle)
    assert len(parsed.sections) == 2
    chunks = chunk_sections(parsed.sections, chunk_size_chars=100)
    assert len(chunks) == 1
    assert chunks[0].start_ms == 1250
    assert chunks[0].end_ms == 8100
    assert "你好同学" in chunks[0].content


def test_plain_text_dispatch_and_long_chunk_split():
    """纯文本规范化与超长文本切片满足上限。"""
    doc = SourceDocument(
        ref="notice:1",
        entityType="notice",
        entityId=1,
        format="plain_text",
        body="第一句。第二句。\r\n\r\n\r\n第三句。",
    )
    parsed = parse_document_text(doc)
    assert "\r" not in parsed.sections[0].text
    long_doc = plain_text.parse_plain_text("A" * 350)
    chunks = chunk_sections(long_doc.sections, chunk_size_chars=120)
    assert len(chunks) >= 3
    assert all(len(c.content) <= 120 for c in chunks)


def test_pdf_parser_detects_scanned_pdf_and_extracts_text_pdf():
    """空白或纯图片扫描件 PDF 标记 unextractable，可提取文本 PDF 保留页码。"""
    scanned = extract_pdf_sections_sync(_make_blank_pdf_bytes(), timeout_s=15.0)
    assert scanned.unextractable is True
    assert scanned.reason == SCANNED_PDF_MESSAGE

    extracted = extract_pdf_sections_sync(_make_text_pdf_bytes("Hello Anynote Index"), timeout_s=15.0)
    assert extracted.unextractable is False
    assert extracted.sections[0].page_no == 1
    assert "Hello Anynote Index" in extracted.sections[0].text


def test_pdf_parser_timeout_raises_limit_error(monkeypatch):
    """PDF 提取子进程超时被终止并抛出中文限制异常。"""

    class FakeProcess:
        def __init__(self, target=None, args=(), daemon=True):
            self.exitcode = None
            self.killed = False

        def start(self):
            return None

        def join(self, timeout=None):
            return None

        def is_alive(self):
            return not self.killed

        def kill(self):
            self.killed = True

    class FakeContext:
        def Queue(self, maxsize=1):
            return object()

        def Process(self, target=None, args=(), daemon=True):
            return FakeProcess(target=target, args=args, daemon=daemon)

    monkeypatch.setattr("indexing.parsers.pdf.multiprocessing.get_context", lambda _mode: FakeContext())
    with pytest.raises(PdfParseLimitError) as captured:
        extract_pdf_sections_sync(b"%PDF-1.4", timeout_s=0.05)
    assert str(captured.value) == PDF_PARSE_LIMIT_MESSAGE
