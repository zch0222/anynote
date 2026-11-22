"""带子进程隔离的 PDF 文本层提取、OCR 兜底与图文行合并。

@author 称霸幼儿园
"""

import difflib
import io
import math
import multiprocessing
import queue
import re
import statistics
import unicodedata
from dataclasses import dataclass
from typing import Any, Literal

from indexing.models import (
    PDF_PARSE_LIMIT_MESSAGE,
    SCANNED_PDF_MESSAGE,
    ParsedDocument,
    ParsedSection,
)
from indexing.parsers.pdf_render import (
    DEFAULT_MAX_IMAGE_BYTES,
    DEFAULT_MAX_PIXELS,
    PageGeometry,
    PdfImageRegion,
    page_geometry,
    page_image_regions,
    render_pdf_pages_in_process,
)

HEADING_SIZE_RATIO = 1.2
HEADING_MAX_CHARS = 80
HEADING_MAX_LEVELS = 3
SENTENCE_END_CHARS = "。．.！!？?；;：:，,、"
GUTTER_START_RATIO = 0.45
GUTTER_END_RATIO = 0.55
COLUMN_MIN_SHARE = 0.30
LINE_TOLERANCE = 3.0
SECTION_PATH_SEPARATOR = " / "
DUPLICATE_OVERLAP_RATIO = 0.50
DUPLICATE_SIMILARITY = 0.85
PDF_EXTRACTOR_VERSION = "pdfplumber-pdfium-rapidocr-v1"

ExtractionMode = Literal["text", "ocr", "none"]


class PdfParseError(RuntimeError):
    """PDF 文件损坏、OCR 失败或解析异常。

    @author 称霸幼儿园
    """


class PdfParseLimitError(PdfParseError):
    """PDF 解析超时或超出内存、页数、区域限制。

    @author 称霸幼儿园
    """

    def __init__(self, message: str = PDF_PARSE_LIMIT_MESSAGE):
        super().__init__(message)


@dataclass(slots=True)
class PdfLine:
    """页面上的一行文本、字号、来源与渲染视口边界框。

    @author 称霸幼儿园
    """

    text: str
    size: float
    extraction_mode: ExtractionMode = "text"
    source_region_id: str | None = None
    bbox: tuple[float, float, float, float] | None = None


@dataclass(slots=True)
class PdfBookmark:
    """PDF 书签条目。

    @author 称霸幼儿园
    """

    title: str
    page_no: int
    level: int


@dataclass(slots=True)
class _PdfPage:
    page_no: int
    lines: list[PdfLine]
    body_size: float
    has_words: bool
    regions: list[PdfImageRegion]
    geometry: PageGeometry


def group_lines(words: list[dict[str, Any]]) -> list[PdfLine]:
    """把 pdfplumber 单词按纵坐标合并为行，行内按横坐标排序。

    :param words: 含 text、x0、top、size 的单词字典
    :return: 自上而下的行列表
    """
    ordered = sorted(words, key=lambda word: (float(word["top"]), float(word["x0"])))
    rows: list[list[dict[str, Any]]] = []
    for word in ordered:
        if rows and abs(float(word["top"]) - float(rows[-1][0]["top"])) <= LINE_TOLERANCE:
            rows[-1].append(word)
        else:
            rows.append([word])
    lines: list[PdfLine] = []
    for row in rows:
        row.sort(key=lambda word: float(word["x0"]))
        text = " ".join(str(word["text"]).strip() for word in row if str(word["text"]).strip())
        if not text:
            continue
        sizes = [float(word.get("size") or 0.0) for word in row]
        bbox = (
            min(float(word["x0"]) for word in row),
            min(float(word["top"]) for word in row),
            max(float(word.get("x1", word["x0"])) for word in row),
            max(float(word.get("bottom", float(word["top"]) + float(word.get("size") or 0.0))) for word in row),
        )
        lines.append(PdfLine(
            text=_join_cjk(text),
            size=sum(sizes) / len(sizes) if sizes else 0.0,
            bbox=bbox,
        ))
    return lines


def split_columns(words: list[dict[str, Any]], page_width: float) -> list[list[dict[str, Any]]]:
    """判定双栏页面并按先左后右拆分单词。

    :param words: 页面单词
    :param page_width: 页面宽度
    :return: 单栏时为一组，双栏时为左右两组
    """
    if not words or page_width <= 0:
        return [words]
    gutter_start = page_width * GUTTER_START_RATIO
    gutter_end = page_width * GUTTER_END_RATIO
    left: list[dict[str, Any]] = []
    right: list[dict[str, Any]] = []
    for word in words:
        x0 = float(word["x0"])
        x1 = float(word["x1"])
        if x0 < gutter_end and x1 > gutter_start:
            return [words]
        if x1 <= gutter_start:
            left.append(word)
        else:
            right.append(word)
    total = len(words)
    if len(left) / total >= COLUMN_MIN_SHARE and len(right) / total >= COLUMN_MIN_SHARE:
        return [left, right]
    return [words]


def body_font_size(words: list[dict[str, Any]]) -> float:
    """计算页面正文字号：按字符数加权的字号中位数。

    :param words: 页面单词
    :return: 正文字号，无单词时为 0
    """
    sizes: list[float] = []
    for word in words:
        size = float(word.get("size") or 0.0)
        sizes.extend([size] * max(1, len(str(word["text"]))))
    return statistics.median(sizes) if sizes else 0.0


def is_heading_line(line: PdfLine, body_size: float) -> bool:
    """判定文本层一行是否为标题：字号够大、足够短且不以句末标点结尾。

    :param line: 文本行
    :param body_size: 所在页正文字号
    :return: 是否为标题
    """
    text = line.text.strip()
    if line.extraction_mode != "text" or not text or body_size <= 0:
        return False
    if line.size < body_size * HEADING_SIZE_RATIO:
        return False
    if len(text) > HEADING_MAX_CHARS:
        return False
    return text[-1] not in SENTENCE_END_CHARS


def heading_levels(sizes: list[float]) -> dict[float, int]:
    """按字号从大到小给标题分级，最多三级，更小的字号并入第三级。

    :param sizes: 全文所有标题行的字号
    :return: 规整字号到层级的映射
    """
    distinct = sorted({_round_size(size) for size in sizes}, reverse=True)
    return {size: min(index + 1, HEADING_MAX_LEVELS) for index, size in enumerate(distinct)}


def build_pdf_sections(
    pages: list[tuple[int, list[PdfLine], float]],
    bookmarks: list[PdfBookmark],
) -> list[ParsedSection]:
    """把逐页文本行组装为带标题路径、页码与提取来源的段落。

    :param pages: （页码, 行列表, 正文字号）
    :param bookmarks: 书签列表，可为空
    :return: 段落列表
    """
    if bookmarks:
        return _sections_from_bookmarks(pages, bookmarks)
    return _sections_from_font(pages)


def _sections_from_font(pages: list[tuple[int, list[PdfLine], float]]) -> list[ParsedSection]:
    heading_sizes = [
        line.size for _page_no, lines, body in pages for line in lines if is_heading_line(line, body)
    ]
    levels = heading_levels(heading_sizes)
    sections: list[ParsedSection] = []
    stack: list[tuple[int, str]] = []
    for page_no, lines, body in pages:
        buffer: list[PdfLine] = []
        for line in lines:
            if is_heading_line(line, body):
                _flush(sections, buffer, stack, page_no)
                level = levels.get(_round_size(line.size), HEADING_MAX_LEVELS)
                while stack and stack[-1][0] >= level:
                    stack.pop()
                stack.append((level, line.text.strip()))
                continue
            buffer.append(line)
        _flush(sections, buffer, stack, page_no)
    return sections


def _sections_from_bookmarks(
    pages: list[tuple[int, list[PdfLine], float]],
    bookmarks: list[PdfBookmark],
) -> list[ParsedSection]:
    ordered = sorted(enumerate(bookmarks), key=lambda item: (item[1].page_no, item[0]))
    sections: list[ParsedSection] = []
    stack: list[tuple[int, str]] = []
    cursor = 0
    for page_no, lines, _body in pages:
        on_page: list[PdfBookmark] = []
        while cursor < len(ordered) and ordered[cursor][1].page_no <= page_no:
            bookmark = ordered[cursor][1]
            if bookmark.page_no < page_no:
                _push(stack, bookmark)
            else:
                on_page.append(bookmark)
            cursor += 1
        line_titles = {_normalize(line.text) for line in lines if line.extraction_mode == "text"}
        pending = [bookmark for bookmark in on_page if _normalize(bookmark.title) in line_titles]
        for bookmark in on_page:
            if bookmark not in pending:
                _push(stack, bookmark)
        buffer: list[PdfLine] = []
        for line in lines:
            match = next(
                (
                    bookmark
                    for bookmark in pending
                    if line.extraction_mode == "text" and _normalize(bookmark.title) == _normalize(line.text)
                ),
                None,
            )
            if match is not None:
                _flush(sections, buffer, stack, page_no)
                _push(stack, match)
                pending.remove(match)
                continue
            buffer.append(line)
        _flush(sections, buffer, stack, page_no)
    return sections


def _push(stack: list[tuple[int, str]], bookmark: PdfBookmark) -> None:
    while stack and stack[-1][0] >= bookmark.level:
        stack.pop()
    stack.append((bookmark.level, bookmark.title.strip()))


def _flush(
    sections: list[ParsedSection],
    buffer: list[PdfLine],
    stack: list[tuple[int, str]],
    page_no: int,
) -> None:
    """按连续提取来源输出行缓冲，避免混合来源落入同一段落。"""
    path = SECTION_PATH_SEPARATOR.join(title for _level, title in stack) or None
    group: list[PdfLine] = []

    def emit() -> None:
        if not group:
            return
        text = "\n".join(line.text for line in group).strip()
        if text:
            first = group[0]
            sections.append(ParsedSection(
                text=text,
                section_path=path,
                page_no=page_no,
                extraction_mode=first.extraction_mode,
                source_region_id=first.source_region_id,
            ))
        group.clear()

    for line in buffer:
        if group and (group[0].extraction_mode, group[0].source_region_id) != (
            line.extraction_mode,
            line.source_region_id,
        ):
            emit()
        group.append(line)
    emit()
    buffer.clear()


def merge_pdf_lines(lines: list[PdfLine]) -> list[PdfLine]:
    """合并文本层与 OCR 行，按边界重叠及文本相似度去除 OCR 重复。

    :param lines: 同页的文本层与 OCR 行
    :return: 按纵坐标、横坐标排序的去重行
    """
    text_lines = [line for line in lines if line.extraction_mode == "text"]
    kept_ocr: list[PdfLine] = []
    for candidate in lines:
        if candidate.extraction_mode != "ocr":
            continue
        if any(_is_duplicate_ocr(candidate, existing) for existing in [*text_lines, *kept_ocr]):
            continue
        kept_ocr.append(candidate)
    merged = [*text_lines, *kept_ocr]
    return sorted(
        merged,
        key=lambda line: (
            line.bbox[1] if line.bbox is not None else float("inf"),
            line.bbox[0] if line.bbox is not None else float("inf"),
        ),
    )


def _is_duplicate_ocr(candidate: PdfLine, existing: PdfLine) -> bool:
    if candidate.bbox is None or existing.bbox is None:
        return False
    left = max(candidate.bbox[0], existing.bbox[0])
    top = max(candidate.bbox[1], existing.bbox[1])
    right = min(candidate.bbox[2], existing.bbox[2])
    bottom = min(candidate.bbox[3], existing.bbox[3])
    if right <= left or bottom <= top:
        return False
    candidate_area = (candidate.bbox[2] - candidate.bbox[0]) * (candidate.bbox[3] - candidate.bbox[1])
    if candidate_area <= 0:
        return False
    overlap = (right - left) * (bottom - top) / candidate_area
    if overlap < DUPLICATE_OVERLAP_RATIO:
        return False
    similarity = difflib.SequenceMatcher(
        None,
        _normalize(candidate.text),
        _normalize(existing.text),
    ).ratio()
    return similarity >= DUPLICATE_SIMILARITY


def _round_size(size: float) -> float:
    return round(size * 2) / 2


def _normalize(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text or "")
    return re.sub(r"\s+", "", normalized)


def _join_cjk(text: str) -> str:
    return re.sub(r"(?<=[　-鿿＀-￯]) (?=[　-鿿＀-￯])", "", text)


def _read_bookmarks(reader: Any) -> list[tuple[str, int, int]]:
    result: list[tuple[str, int, int]] = []

    def walk(items: list[Any], level: int) -> None:
        for item in items:
            if isinstance(item, list):
                walk(item, level + 1)
                continue
            title = str(getattr(item, "title", "") or "").strip()
            if not title:
                continue
            try:
                page_index = reader.get_destination_page_number(item)
            except Exception:
                continue
            if page_index is None or page_index < 0:
                continue
            result.append((title, page_index + 1, level))

    try:
        walk(list(reader.outline or []), 1)
    except Exception:
        return []
    return result


def _set_memory_limit(max_memory_mb: int) -> None:
    try:
        import resource

        limit_bytes = max_memory_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (limit_bytes, limit_bytes))
    except (ImportError, ValueError, OSError):
        pass


def _adjust_words_to_crop(
    words: list[dict[str, Any]],
    geometry: PageGeometry,
) -> list[dict[str, Any]]:
    """把 pdfplumber 的旋转页面坐标换算到实际 CropBox 渲染视口。"""
    full_media_box = (
        geometry.crop_right - geometry.crop_left == geometry.media_width
        and geometry.crop_top - geometry.crop_bottom == geometry.media_height
    )
    if full_media_box:
        return [dict(word) for word in words]
    adjusted: list[dict[str, Any]] = []
    for original in words:
        word = dict(original)
        x0 = float(word["x0"]) - geometry.crop_x
        x1 = float(word["x1"]) - geometry.crop_x
        top = float(word["top"]) - geometry.crop_y
        bottom = float(word["bottom"]) - geometry.crop_y
        if x1 <= 0 or top >= geometry.height or x0 >= geometry.width or bottom <= 0:
            continue
        word["x0"] = max(0.0, x0)
        word["x1"] = min(geometry.width, x1)
        word["top"] = max(0.0, top)
        word["bottom"] = min(geometry.height, bottom)
        adjusted.append(word)
    return adjusted


def _ocr_bbox_to_page(
    bbox: tuple[float, float, float, float],
    *,
    offset_x: float,
    offset_y: float,
    page_width: float,
    page_height: float,
    image_width: int,
    image_height: int,
) -> tuple[float, float, float, float]:
    """把 OCR 输入图像的像素边界换算到整页渲染坐标。"""
    scale_x = page_width / image_width
    scale_y = page_height / image_height
    return (
        offset_x + bbox[0] * scale_x,
        offset_y + bbox[1] * scale_y,
        offset_x + bbox[2] * scale_x,
        offset_y + bbox[3] * scale_y,
    )


def _crop_region(image: Any, bbox: tuple[float, float, float, float]) -> tuple[bytes, int, int, int, int]:
    """按归一化边界裁剪区域 OCR 图像并返回像素偏移。"""
    left = max(0, min(image.width - 1, int(bbox[0] * image.width)))
    top = max(0, min(image.height - 1, int(bbox[1] * image.height)))
    right = max(left + 1, min(image.width, math.ceil(bbox[2] * image.width)))
    bottom = max(top + 1, min(image.height, math.ceil(bbox[3] * image.height)))
    cropped = image.crop((left, top, right, bottom))
    try:
        buffer = io.BytesIO()
        cropped.save(buffer, format="JPEG", quality=95, optimize=True)
        return buffer.getvalue(), left, top, cropped.width, cropped.height
    finally:
        cropped.close()


def _ocr_page(
    data: bytes,
    page: _PdfPage,
    engine: Any,
    render_scale: float,
) -> list[PdfLine]:
    """按无文本整页或有文本逐区域规则执行 OCR 并合并行。"""
    from PIL import Image

    rendered = render_pdf_pages_in_process(
        data,
        [page.page_no],
        scale=render_scale,
        max_image_bytes=DEFAULT_MAX_IMAGE_BYTES,
        max_pixels=DEFAULT_MAX_PIXELS,
        max_pages=1,
    )[0]
    ocr_lines: list[PdfLine] = []
    if not page.has_words:
        for line in engine.recognize(rendered.data):
            ocr_lines.append(PdfLine(
                text=line.text,
                size=0.0,
                extraction_mode="ocr",
                bbox=_ocr_bbox_to_page(
                    line.bbox,
                    offset_x=0.0,
                    offset_y=0.0,
                    page_width=page.geometry.width,
                    page_height=page.geometry.height,
                    image_width=rendered.width,
                    image_height=rendered.height,
                ),
            ))
        return merge_pdf_lines(ocr_lines)

    image = Image.open(io.BytesIO(rendered.data))
    try:
        for region in page.regions:
            region_bytes, left, top, width, height = _crop_region(image, region.bbox)
            for line in engine.recognize(region_bytes):
                ocr_lines.append(PdfLine(
                    text=line.text,
                    size=0.0,
                    extraction_mode="ocr",
                    source_region_id=region.region_id,
                    bbox=_ocr_bbox_to_page(
                        line.bbox,
                        offset_x=left,
                        offset_y=top,
                        page_width=page.geometry.width,
                        page_height=page.geometry.height,
                        image_width=rendered.width,
                        image_height=rendered.height,
                    ),
                ))
    finally:
        image.close()
    return merge_pdf_lines([*page.lines, *ocr_lines])


def _extract_document(
    data: bytes,
    *,
    ocr_enabled: bool,
    ocr_max_pages: int,
    ocr_max_regions_per_page: int,
    ocr_render_scale: float,
) -> dict[str, Any]:
    """在当前子进程内提取文本层、实际图片与 OCR 行。"""
    import pdfplumber
    import pypdfium2 as pdfium
    from pypdf import PdfReader

    bookmarks = _read_bookmarks(PdfReader(io.BytesIO(data)))
    document = pdfium.PdfDocument(data)
    pages: list[_PdfPage] = []
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            page_count = len(pdf.pages)
            if len(document) != page_count:
                raise PdfParseError("PDF page count mismatch")
            for page_no, plumber_page in enumerate(pdf.pages, start=1):
                pdfium_page = document[page_no - 1]
                try:
                    geometry = page_geometry(pdfium_page)
                    regions = page_image_regions(pdfium_page, page_no)
                finally:
                    pdfium_page.close()
                raw_words = plumber_page.extract_words(
                    extra_attrs=["size"],
                    keep_blank_chars=False,
                    use_text_flow=False,
                )
                words = _adjust_words_to_crop(raw_words, geometry)
                body = body_font_size(words)
                lines: list[PdfLine] = []
                for column in split_columns(words, geometry.width):
                    lines.extend(group_lines(column))
                pages.append(_PdfPage(
                    page_no=page_no,
                    lines=lines,
                    body_size=body,
                    has_words=bool(words),
                    regions=regions,
                    geometry=geometry,
                ))
    finally:
        document.close()

    if ocr_enabled:
        ocr_pages = [page for page in pages if not page.has_words or page.regions]
        if len(ocr_pages) > ocr_max_pages:
            raise PdfParseLimitError("PDF OCR page limit exceeded")
        for page in pages:
            if len(page.regions) > ocr_max_regions_per_page:
                raise PdfParseLimitError("PDF OCR region limit exceeded")
        if ocr_pages:
            from indexing.parsers.ocr import RapidOCREngine

            engine = RapidOCREngine()
            for page in ocr_pages:
                page.lines = _ocr_page(data, page, engine, ocr_render_scale)

    has_text = any(page.has_words for page in pages)
    has_images = any(page.regions for page in pages)
    content_mode = "mixed" if has_images else ("text" if has_text else "none")
    return {
        "page_count": page_count,
        "content_mode": content_mode,
        "pages": [
            (
                page.page_no,
                [
                    (line.text, line.size, line.extraction_mode, line.source_region_id, line.bbox)
                    for line in page.lines
                ],
                page.body_size,
            )
            for page in pages
            if page.lines
        ],
        "bookmarks": bookmarks,
    }


def _extract_in_process(
    data: bytes,
    max_memory_mb: int,
    result_queue: Any,
    ocr_enabled: bool = False,
    ocr_max_pages: int = 200,
    ocr_max_regions_per_page: int = 100,
    ocr_render_scale: float = 2.0,
) -> None:
    """在子进程中执行 PDF 解析并回传不含图片字节的结果。"""
    _set_memory_limit(max_memory_mb)
    try:
        result = _extract_document(
            data,
            ocr_enabled=ocr_enabled,
            ocr_max_pages=ocr_max_pages,
            ocr_max_regions_per_page=ocr_max_regions_per_page,
            ocr_render_scale=ocr_render_scale,
        )
        result_queue.put(("ok", result))
    except MemoryError:
        result_queue.put(("limit", PDF_PARSE_LIMIT_MESSAGE))
    except PdfParseLimitError as error:
        result_queue.put(("limit", str(error)))
    except Exception as error:
        result_queue.put(("error", f"{type(error).__name__}: {error}"))


def extract_pdf_sections_sync(
    data: bytes,
    timeout_s: float = 30.0,
    max_memory_mb: int = 512,
    ocr_enabled: bool = False,
    ocr_max_pages: int = 200,
    ocr_max_regions_per_page: int = 100,
    ocr_render_scale: float = 2.0,
) -> ParsedDocument:
    """在独立子进程中解析 PDF，并按配置补充整页或图片区域 OCR。

    :param data: PDF 二进制内容
    :param timeout_s: 本次解析与 OCR 总超时秒数
    :param max_memory_mb: 子进程虚拟内存上限（MB）
    :param ocr_enabled: 是否启用本地 OCR
    :param ocr_max_pages: 单份 PDF 允许 OCR 的最大页数
    :param ocr_max_regions_per_page: 单页允许 OCR 的最大图片区域数
    :param ocr_render_scale: OCR 渲染倍率
    :return: 带页码、内容形态与行级来源的解析结果
    """
    if not data:
        raise PdfParseError("PDF 内容为空")

    context = multiprocessing.get_context("spawn")
    result_queue = context.Queue(maxsize=1)
    process = context.Process(
        target=_extract_in_process,
        args=(
            data,
            max_memory_mb,
            result_queue,
            ocr_enabled,
            ocr_max_pages,
            ocr_max_regions_per_page,
            ocr_render_scale,
        ),
        daemon=True,
    )
    process.start()
    try:
        status, payload = result_queue.get(timeout=timeout_s)
    except queue.Empty as error:
        if process.is_alive():
            process.kill()
            process.join(timeout=5.0)
            raise PdfParseLimitError(PDF_PARSE_LIMIT_MESSAGE) from error
        if process.exitcode not in (0, None):
            raise PdfParseLimitError(PDF_PARSE_LIMIT_MESSAGE) from error
        raise PdfParseError("PDF 解析子进程未返回结果") from error
    process.join(timeout=5.0)
    if process.is_alive():
        process.kill()
        process.join(timeout=5.0)

    if status == "limit":
        raise PdfParseLimitError(str(payload))
    if status != "ok":
        raise PdfParseError(str(payload))

    page_lines = [
        (
            page_no,
            [
                PdfLine(
                    text=text,
                    size=size,
                    extraction_mode=extraction_mode,
                    source_region_id=source_region_id,
                    bbox=bbox,
                )
                for text, size, extraction_mode, source_region_id, bbox in lines
            ],
            body,
        )
        for page_no, lines, body in payload["pages"]
    ]
    sections = build_pdf_sections(
        page_lines,
        [
            PdfBookmark(title=title, page_no=page_no, level=level)
            for title, page_no, level in payload["bookmarks"]
        ],
    )
    metadata = {
        "page_count": payload["page_count"],
        "content_mode": payload["content_mode"],
        "extractor_version": PDF_EXTRACTOR_VERSION,
    }
    if not sections:
        return ParsedDocument(
            sections=[],
            unextractable=True,
            reason=SCANNED_PDF_MESSAGE,
            **metadata,
        )
    return ParsedDocument(sections=sections, **metadata)


async def parse_pdf_bytes(
    data: bytes,
    timeout_s: float = 30.0,
    max_memory_mb: int = 512,
    ocr_enabled: bool = False,
    ocr_max_pages: int = 200,
    ocr_max_regions_per_page: int = 100,
    ocr_render_scale: float = 2.0,
) -> ParsedDocument:
    """异步包装子进程 PDF 文本提取与 OCR。

    :param data: PDF 字节数据
    :param timeout_s: 总超时秒数
    :param max_memory_mb: 子进程内存上限（MB）
    :param ocr_enabled: 是否启用本地 OCR
    :param ocr_max_pages: 最大 OCR 页数
    :param ocr_max_regions_per_page: 单页最大 OCR 区域数
    :param ocr_render_scale: OCR 渲染倍率
    :return: 解析结果
    """
    import asyncio

    return await asyncio.to_thread(
        extract_pdf_sections_sync,
        data,
        timeout_s,
        max_memory_mb,
        ocr_enabled,
        ocr_max_pages,
        ocr_max_regions_per_page,
        ocr_render_scale,
    )
