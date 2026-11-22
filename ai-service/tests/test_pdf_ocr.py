"""PDF OCR、图文合并与来源分块单元测试。

@author 称霸幼儿园
"""

import queue

import pytest

from indexing.chunking import chunk_sections
from indexing.models import ParsedSection
from indexing.parsers.ocr import OcrEngineError, OcrLine, normalize_ocr_result
from indexing.parsers.pdf import (
    PdfLine,
    PdfParseError,
    extract_pdf_sections_sync,
    merge_pdf_lines,
)
from indexing.parsers.pdf_render import PdfPageOutOfRangeError, render_pdf_pages_in_process
from tests.pdf_samples import make_pdf_sample


class _ImmediateProcess:
    def __init__(self, target, args, daemon=True):
        self._target = target
        self._args = args
        self.exitcode = 0

    def start(self):
        self._target(*self._args)

    def join(self, timeout=None):
        return None

    def is_alive(self):
        return False

    def kill(self):
        return None


class _ImmediateContext:
    def Queue(self, maxsize=1):
        return queue.Queue(maxsize=maxsize)

    def Process(self, target, args=(), daemon=True):
        return _ImmediateProcess(target, args, daemon)


class _FakeOcrEngine:
    responses: list[list[OcrLine] | Exception] = []
    calls: list[bytes] = []

    def __init__(self):
        self._responses = list(type(self).responses)

    def recognize(self, image: bytes) -> list[OcrLine]:
        type(self).calls.append(image)
        response = self._responses.pop(0) if self._responses else []
        if isinstance(response, Exception):
            raise response
        return response


def _extract(monkeypatch, data: bytes, responses=None, **kwargs):
    """在本进程执行子进程目标，以固定 OCR 结果测试完整页面编排。"""
    _FakeOcrEngine.responses = list(responses or [])
    _FakeOcrEngine.calls = []
    monkeypatch.setattr("indexing.parsers.ocr.RapidOCREngine", _FakeOcrEngine)
    monkeypatch.setattr(
        "indexing.parsers.pdf.multiprocessing.get_context",
        lambda _mode: _ImmediateContext(),
    )
    result = extract_pdf_sections_sync(data, ocr_enabled=True, **kwargs)
    return result, _FakeOcrEngine.calls


def test_scan_page_uses_full_page_ocr_and_keeps_page_metadata(monkeypatch):
    """无文本页执行整页 OCR，页码、混合内容形态与提取版本完整保留。"""
    data = make_pdf_sample([{"image": True}])

    parsed, calls = _extract(
        monkeypatch,
        data,
        responses=[[OcrLine(text="扫描正文", bbox=(0, 0, 100, 20))]],
    )

    assert len(calls) == 1
    assert parsed.page_count == 1
    assert parsed.content_mode == "mixed"
    assert parsed.extractor_version == "pdfplumber-pdfium-rapidocr-v1"
    assert parsed.unextractable is False
    assert [(section.text, section.page_no, section.extraction_mode, section.source_region_id)
            for section in parsed.sections] == [("扫描正文", 1, "ocr", None)]


def test_text_and_image_page_runs_region_ocr_and_splits_sources(monkeypatch):
    """同页已有文本仍执行图片区域 OCR，并保留文本层和区域来源。"""
    data = make_pdf_sample([{"text": "Layer text", "image": True}])

    parsed, calls = _extract(
        monkeypatch,
        data,
        responses=[[OcrLine(text="Image text", bbox=(0, 0, 100, 20))]],
    )

    assert len(calls) == 1
    assert parsed.content_mode == "mixed"
    assert [(section.extraction_mode, section.source_region_id) for section in parsed.sections] == [
        ("text", None),
        ("ocr", "p1-r1"),
    ]
    assert [section.text for section in parsed.sections] == ["Layer text", "Image text"]


def test_text_only_and_unused_image_resources_do_not_trigger_ocr(monkeypatch):
    """纯文本页和只有未使用图片资源的页面不执行 OCR，内容形态为 text。"""
    for page in ({"text": "Plain text"}, {"text": "Plain text", "unusedImage": True}):
        parsed, calls = _extract(monkeypatch, make_pdf_sample([page]))
        assert calls == []
        assert parsed.content_mode == "text"
        assert parsed.page_count == 1
        assert [section.extraction_mode for section in parsed.sections] == ["text"]


def test_blank_pdf_without_text_or_images_is_none(monkeypatch):
    """空白无文本页仍执行整页 OCR，空结果分类为 none 并保持不可提取状态。"""
    parsed, calls = _extract(monkeypatch, make_pdf_sample([{}]))
    assert len(calls) == 1
    assert parsed.page_count == 1
    assert parsed.content_mode == "none"
    assert parsed.unextractable is True


def test_ocr_engine_failure_fails_while_document(monkeypatch):
    """任一图片区域 OCR 异常都使整篇解析失败，不返回残缺段落。"""
    data = make_pdf_sample([{"text": "Layer text", "image": True}])
    with pytest.raises(PdfParseError):
        _extract(monkeypatch, data, responses=[OcrEngineError("injected")])


def test_region_limit_fails_instead_of_skipping_regions(monkeypatch):
    """实际图片区域超过配置上限时整篇失败，不跳过剩余区域。"""
    data = make_pdf_sample([{"text": "Layer text", "image": True}])
    with pytest.raises(PdfParseError):
        _extract(monkeypatch, data, ocr_max_regions_per_page=0)


def test_merge_pdf_lines_deduplicates_text_and_overlapping_ocr():
    """归一化文本相似且边界重叠时优先保留文本层，OCR 之间保留首项。"""
    text = PdfLine(
        text="Ｈello 世界",
        size=12,
        extraction_mode="text",
        bbox=(10, 10, 100, 24),
    )
    duplicate = PdfLine(
        text="Hello世界",
        size=0,
        extraction_mode="ocr",
        bbox=(12, 11, 98, 23),
        source_region_id="p1-r1",
    )
    other = PdfLine(
        text="另一行",
        size=0,
        extraction_mode="ocr",
        bbox=(10, 50, 100, 64),
        source_region_id="p1-r2",
    )

    merged = merge_pdf_lines([duplicate, other, text])

    assert [(line.text, line.extraction_mode) for line in merged] == [
        ("Ｈello 世界", "text"),
        ("另一行", "ocr"),
    ]


def test_chunks_do_not_mix_extraction_modes_or_source_regions():
    """不同提取来源和不同图片区域不合并，长区域拆分沿用区域标识。"""
    sections = [
        ParsedSection(text="文本层", page_no=1, extraction_mode="text"),
        ParsedSection(text="图片一", page_no=1, extraction_mode="ocr", source_region_id="p1-r1"),
        ParsedSection(text="图片二", page_no=1, extraction_mode="ocr", source_region_id="p1-r2"),
    ]

    chunks = chunk_sections(sections, chunk_size_chars=100)

    assert [(chunk.content, chunk.extraction_mode, chunk.source_region_id) for chunk in chunks] == [
        ("文本层", "text", None),
        ("图片一", "ocr", "p1-r1"),
        ("图片二", "ocr", "p1-r2"),
    ]


def test_repeated_image_draws_receive_distinct_region_ids(monkeypatch):
    """同一图片对象重复绘制时逐区域 OCR，并分配不同来源区域 ID。"""
    data = make_pdf_sample([{
        "text": "Layer text",
        "images": [(20, 120, 80, 40), (180, 20, 80, 40)],
    }])

    parsed, calls = _extract(monkeypatch, data, responses=[
        [OcrLine(text="First image", bbox=(0, 0, 100, 20))],
        [OcrLine(text="Second image", bbox=(0, 0, 100, 20))],
    ])

    assert len(calls) == 2
    assert [section.source_region_id for section in parsed.sections] == [None, "p1-r1", "p1-r2"]


def test_mixed_pages_keep_actual_page_numbers(monkeypatch):
    """跨页扫描与纯文本混合时仅处理需要的页面并保留实际页码。"""
    data = make_pdf_sample([{"image": True}, {"text": "Second page"}])

    parsed, calls = _extract(
        monkeypatch,
        data,
        responses=[[OcrLine(text="First page OCR", bbox=(0, 0, 100, 20))]],
    )

    assert len(calls) == 1
    assert parsed.page_count == 2
    assert parsed.content_mode == "mixed"
    assert [(section.page_no, section.extraction_mode) for section in parsed.sections] == [
        (1, "ocr"),
        (2, "text"),
    ]


def test_merge_pdf_lines_deduplicates_overlapping_ocr_lines():
    """没有文本层时，相互重叠且相似的 OCR 行也只保留首项。"""
    first = PdfLine(
        text="重复内容",
        size=0,
        extraction_mode="ocr",
        source_region_id="p1-r1",
        bbox=(10, 10, 100, 24),
    )
    duplicate = PdfLine(
        text="重复 内容",
        size=0,
        extraction_mode="ocr",
        source_region_id="p1-r2",
        bbox=(12, 11, 98, 23),
    )

    assert merge_pdf_lines([first, duplicate]) == [first]


def test_ocr_response_is_sorted_and_empty_lines_are_removed():
    """OCR 适配器隐藏原始响应结构、过滤空行并按阅读顺序排序。"""
    result = [
        ([[0, 30], [20, 30], [20, 40], [0, 40]], "第二行", 0.9),
        ([[0, 0], [20, 0], [20, 10], [0, 10]], " ", 0.9),
        ([[0, 10], [20, 10], [20, 20], [0, 20]], "第一行", 0.9),
    ]

    lines = normalize_ocr_result(result)

    assert [(line.text, line.bbox) for line in lines] == [
        ("第一行", (0.0, 10.0, 20.0, 20.0)),
        ("第二行", (0.0, 30.0, 20.0, 40.0)),
    ]


@pytest.mark.parametrize(
    ("rotation", "expected"),
    [
        (0, (0.407407, 0.5, 0.703704, 0.75)),
        (90, (0.25, 0.407407, 0.5, 0.703704)),
        (180, (0.296296, 0.25, 0.592593, 0.5)),
        (270, (0.5, 0.296296, 0.75, 0.592593)),
    ],
)
def test_render_regions_align_with_cropbox_and_rotation(rotation, expected):
    """图片区域归一化坐标与 CropBox、旋转后的实际 JPEG 像素位置一致。"""
    data = make_pdf_sample([{"image": True, "rotate": rotation, "cropbox": (10, 20, 280, 180)}])

    page = render_pdf_pages_in_process(data, [1], scale=1.0, max_pages=1)[0]

    assert page.regions[0].bbox == pytest.approx(expected, abs=1e-5)
    assert page.data.startswith(b"\xff\xd8")
    assert len(page.sha256) == 64


def test_renderer_rejects_page_beyond_current_document():
    """请求超出当前 PDF 页数时返回带实际页数的确定异常。"""
    with pytest.raises(PdfPageOutOfRangeError) as captured:
        render_pdf_pages_in_process(make_pdf_sample([{}]), [2], max_pages=1)
    assert captured.value.page_count == 1


def test_real_rapidocr_reads_image_only_pdf_offline():
    """真实 RapidOCR 使用随包模型识别无文本层 PDF，不经过 mock 引擎。"""
    data = make_pdf_sample([{"imageText": "Hello Anynote"}])

    parsed = extract_pdf_sections_sync(
        data,
        timeout_s=60.0,
        max_memory_mb=2048,
        ocr_enabled=True,
    )

    text = "\n".join(section.text for section in parsed.sections)
    assert "Hello" in text
    assert "Anynote" in text
    assert parsed.content_mode == "mixed"
    assert parsed.sections[0].extraction_mode == "ocr"


def test_ocr_engine_uses_bounded_onnx_threads(monkeypatch):
    """ONNX 引擎使用有界线程参数，避免默认全核初始化耗尽虚拟内存。"""
    from indexing.parsers.ocr import RapidOCREngine

    captured = {}

    def fake_engine(**kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setattr("rapidocr_onnxruntime.RapidOCR", fake_engine)
    engine = RapidOCREngine()
    assert engine._engine is not None
    assert captured == {"intra_op_num_threads": 4, "inter_op_num_threads": 2}


def test_render_subprocess_result_is_consumed_before_join(monkeypatch):
    """父进程先消费大 JPEG 队列结果再等待子进程退出，避免双向等待。"""
    from indexing.parsers import pdf_render

    events = []

    class ResultQueue:
        def get(self, timeout=None):
            events.append("get")
            return "ok", []

    class Process:
        exitcode = 0

        def start(self):
            events.append("start")

        def join(self, timeout=None):
            events.append("join")

        def is_alive(self):
            return False

        def kill(self):
            events.append("kill")

    class Context:
        def Queue(self, maxsize=1):
            return ResultQueue()

        def Process(self, target=None, args=(), daemon=True):
            return Process()

    monkeypatch.setattr(pdf_render.multiprocessing, "get_context", lambda _mode: Context())
    assert pdf_render.render_pdf_pages_sync(b"%PDF", [1]) == []
    assert events == ["start", "get", "join"]
