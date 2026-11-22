"""源文档解析与分块器单元测试。

@author 称霸幼儿园
"""

import io
import queue
import time

import pytest
from pypdf import PdfWriter

from indexing.chunking import chunk_sections
from indexing.models import PDF_PARSE_LIMIT_MESSAGE, SCANNED_PDF_MESSAGE, ParsedSection, SourceDocument
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
    assert len(parsed.sections) == 3
    assert parsed.sections[0].section_path == "总览"
    assert parsed.sections[1].section_path == "总览 / 子节"
    assert parsed.sections[1].block_type == "code"
    assert "# 不是标题" in parsed.sections[1].text
    assert parsed.sections[2].section_path == "总览 / 子节"


def test_markdown_preserves_block_types_and_inclusive_line_ranges():
    """Markdown 解析保留代码块、表格类型和 1 起闭区间行号。"""
    md = "# 标题\n正文\n\n```py\nx = 1\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n"

    parsed = markdown.parse_markdown(md)

    assert [(section.block_type, section.start_line, section.end_line) for section in parsed.sections] == [
        ("paragraph", 2, 2),
        ("code", 4, 6),
        ("table", 8, 10),
    ]


def test_split_paragraph_chunks_keep_their_source_line_ranges():
    """跨行段落拆分后，每个分块保留对应的原始行范围。"""
    sections = markdown.parse_markdown("# 标题\nAlpha\nBeta").sections

    chunks = chunk_sections(sections, chunk_size_chars=6)

    assert [(chunk.content, chunk.start_line, chunk.end_line) for chunk in chunks] == [
        ("Alpha", 2, 2),
        ("Beta", 3, 3),
    ]


def test_markdown_groups_small_paragraphs_with_complete_line_ranges():
    """同标题下相邻小段落合并，并保留完整源行范围。"""
    sections = markdown.parse_markdown("\n\n# 标题\n  Alpha  \n\nBeta\n").sections

    chunks = chunk_sections(sections, chunk_size_chars=100)

    assert [(chunk.content, chunk.start_line, chunk.end_line) for chunk in chunks] == [
        ("Alpha\n\nBeta", 4, 6),
    ]


def test_markdown_does_not_group_across_heading_or_large_blank_gap():
    """同名标题边界及多个空行之间的文本保持独立分块。"""
    sections = markdown.parse_markdown("# 同名\nAlpha\n# 同名\nBeta\n\n\nGamma").sections

    chunks = chunk_sections(sections, chunk_size_chars=100)

    assert [(chunk.content, chunk.start_line, chunk.end_line) for chunk in chunks] == [
        ("Alpha", 2, 2),
        ("Beta", 4, 4),
        ("Gamma", 7, 7),
    ]


def test_markdown_parses_lists_and_images_and_groups_them_with_paragraphs():
    """列表和独立图片保留类型、替代文本和行号，并与相邻段落分组。"""
    md = "# 标题\nIntro\n\n- first\n- second\n  continuation\n\n![架构图](https://example.test/a.png)\n\nEnd"

    sections = markdown.parse_markdown(md).sections
    chunks = chunk_sections(sections, chunk_size_chars=200)

    assert [(section.block_type, section.start_line, section.end_line) for section in sections] == [
        ("paragraph", 2, 2), ("list", 4, 6), ("image", 8, 8), ("paragraph", 10, 10),
    ]
    assert sections[2].text == "![架构图](https://example.test/a.png)"
    assert len(chunks) == 1
    assert chunks[0].content == "\n\n".join(section.text for section in sections)
    assert (chunks[0].start_line, chunks[0].end_line) == (2, 10)


def test_markdown_typed_blocks_split_without_blank_separators():
    """无空行相隔的段落、列表和图片仍解析为各自类型。"""
    sections = markdown.parse_markdown("Intro\n1. first\n2. second\n![说明](a.png)\nEnd").sections

    assert [(section.block_type, section.start_line, section.end_line) for section in sections] == [
        ("paragraph", 1, 1), ("list", 2, 3), ("image", 4, 4), ("paragraph", 5, 5),
    ]


@pytest.mark.parametrize("chunk_size", [6, 100])
def test_chunk_line_ranges_account_for_trimmed_leading_blank_lines(chunk_size):
    """移除块首尾空白后，行范围仍对应原始文本中的实际内容。"""
    section = ParsedSection(text="\n\n Alpha\nBeta \n", start_line=8, end_line=12)

    chunks = chunk_sections([section], chunk_size_chars=chunk_size)

    assert chunks[0].start_line == 10
    assert chunks[-1].end_line == 11
    assert all(10 <= chunk.start_line <= chunk.end_line <= 11 for chunk in chunks)


def test_markdown_grouping_respects_character_cap_and_atomic_blocks():
    """普通块合并遵守字符上限，代码块前后保持边界。"""
    sections = markdown.parse_markdown("Alpha\n\nBeta\n\nGamma\n\n```py\nx\n```\n\nDelta").sections

    chunks = chunk_sections(sections, chunk_size_chars=11)

    assert [chunk.content for chunk in chunks] == ["Alpha\n\nBeta", "Gamma", "```py\nx\n```", "Delta"]
    assert [(chunk.start_line, chunk.end_line) for chunk in chunks] == [(1, 3), (5, 5), (7, 9), (11, 11)]


def test_chunk_grouping_keeps_pdf_page_boundaries():
    """相同章节路径的不同 PDF 页保持独立分块。"""
    sections = [ParsedSection(text="Alpha", section_path="标题", page_no=1),
                ParsedSection(text="Beta", section_path="标题", page_no=2)]

    chunks = chunk_sections(sections, chunk_size_chars=100)

    assert [(chunk.content, chunk.page_no) for chunk in chunks] == [("Alpha", 1), ("Beta", 2)]


def test_code_and_table_blocks_stay_whole_when_over_chunk_limit(caplog):
    """超长代码块和表格保持为完整的单个分块。"""
    md = "```py\n" + "x = 1\n" * 5 + "```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |"
    sections = markdown.parse_markdown(md).sections

    with caplog.at_level("WARNING", logger="indexing.chunking"):
        chunks = chunk_sections(sections, chunk_size_chars=10)

    assert [chunk.content for chunk in chunks] == [sections[0].text, sections[1].text]
    assert len(chunks[0].content) > 10
    assert len(chunks[1].content) > 10
    assert len([record for record in caplog.records if "超出分块字符上限" in record.message]) == 2
    assert [(chunk.start_line, chunk.end_line) for chunk in chunks] == [(1, 7), (9, 12)]


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


def test_srt_chunking_splits_on_gaps_and_sixty_second_window():
    """SRT 在超过 5 秒字幕间隔及 60 秒窗口时另起分块。"""
    sections = [
        srt.parse_srt("1\n00:00:01,000 --> 00:00:02,000\n第一句").sections[0],
        srt.parse_srt("2\n00:00:08,001 --> 00:00:09,000\n第二句").sections[0],
        srt.parse_srt("3\n00:00:12,000 --> 00:00:13,000\n第三句").sections[0],
        srt.parse_srt("4\n00:01:05,000 --> 00:01:06,000\n第四句").sections[0],
    ]

    chunks = chunk_sections(sections, chunk_size_chars=100)

    assert [(chunk.start_ms, chunk.end_ms) for chunk in chunks] == [
        (1000, 2000),
        (8001, 13000),
        (65000, 66000),
    ]


def test_srt_chunking_caps_window_at_sixty_seconds():
    """相邻字幕累计超过 60 秒时另起分块。"""
    sections = [
        srt.parse_srt("1\n00:00:00,000 --> 00:01:00,000\n长时间片段").sections[0],
        srt.parse_srt("2\n00:01:00,000 --> 00:01:01,000\n后续片段").sections[0],
    ]

    chunks = chunk_sections(sections, chunk_size_chars=100)

    assert [(chunk.start_ms, chunk.end_ms) for chunk in chunks] == [(0, 60000), (60000, 61000)]


def test_srt_keeps_a_single_oversized_cue_with_its_source_time_range():
    """超长单条字幕保持完整并保留原时间范围。"""
    section = srt.parse_srt("1\n00:00:01,000 --> 00:00:05,000\n超长字幕正文内容").sections[0]

    chunks = chunk_sections([section], chunk_size_chars=3)

    assert len(chunks) == 1
    assert chunks[0].content == "超长字幕正文内容"
    assert chunks[0].start_ms == 1000
    assert chunks[0].end_ms == 5000


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
            class EmptyQueue:
                def get(self, timeout=None):
                    raise queue.Empty()

            return EmptyQueue()

        def Process(self, target=None, args=(), daemon=True):
            return FakeProcess(target=target, args=args, daemon=daemon)

    monkeypatch.setattr("indexing.parsers.pdf.multiprocessing.get_context", lambda _mode: FakeContext())
    with pytest.raises(PdfParseLimitError) as captured:
        extract_pdf_sections_sync(b"%PDF-1.4", timeout_s=0.05)
    assert str(captured.value) == PDF_PARSE_LIMIT_MESSAGE
