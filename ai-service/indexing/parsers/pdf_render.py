"""受限 PDF 页面渲染、实际图片区域检测与坐标归一化。

@author 称霸幼儿园
"""

import hashlib
import io
import math
import multiprocessing
import queue
from dataclasses import dataclass, field
from typing import Any

DEFAULT_MAX_IMAGE_BYTES = 16 * 1024 * 1024
DEFAULT_MAX_TOTAL_BYTES = 256 * 1024 * 1024
DEFAULT_MAX_PIXELS = 40_000_000


class PdfRenderError(RuntimeError):
    """PDF 渲染或原生页面读取失败。

    @author 称霸幼儿园
    """


class PdfRenderLimitError(PdfRenderError):
    """PDF 渲染超时或超出页数、像素、字节、内存限制。

    @author 称霸幼儿园
    """


class PdfRenderTimeoutError(PdfRenderLimitError):
    """PDF 渲染子进程超过时间限制。

    @author 称霸幼儿园
    """


class PdfPageOutOfRangeError(PdfRenderError):
    """请求页码超出当前 PDF 页数。

    @author 称霸幼儿园
    """

    def __init__(self, page_count: int):
        super().__init__(f"page out of range; page_count={page_count}")
        self.page_count = page_count


@dataclass(slots=True)
class PdfImageRegion:
    """实际绘制图片在整页渲染图中的归一化边界框。

    @author 称霸幼儿园
    """

    region_id: str
    bbox: tuple[float, float, float, float]


@dataclass(slots=True)
class PageGeometry:
    """应用 CropBox 与旋转后的页面几何信息。

    @author 称霸幼儿园
    """

    width: float
    height: float
    crop_x: float
    crop_y: float
    media_width: float
    media_height: float
    crop_left: float
    crop_bottom: float
    crop_right: float
    crop_top: float
    rotation: int


@dataclass(slots=True)
class RenderedPdfPage:
    """一页 JPEG 图像及实际图片区域元数据。

    @author 称霸幼儿园
    """

    page_no: int
    data: bytes = field(repr=False)
    width: int
    height: int
    sha256: str
    regions: list[PdfImageRegion] = field(default_factory=list)

    @property
    def size_bytes(self) -> int:
        """返回实际 JPEG 字节数。"""
        return len(self.data)


def page_geometry(page: Any) -> PageGeometry:
    """读取 PDFium 页面尺寸并计算 pdfplumber 坐标到裁剪视口的偏移。

    :param page: PDFium 页面对象
    :return: 渲染视口及坐标换算参数
    """
    media_left, media_bottom, media_right, media_top = (float(value) for value in page.get_mediabox())
    crop_left, crop_bottom, crop_right, crop_top = (float(value) for value in page.get_cropbox())
    media_width = media_right - media_left
    media_height = media_top - media_bottom
    rotation = int(page.get_rotation()) % 360
    if rotation == 90:
        crop_x, crop_y = crop_bottom - media_bottom, crop_left - media_left
    elif rotation == 180:
        crop_x, crop_y = media_right - crop_right, crop_bottom - media_bottom
    elif rotation == 270:
        crop_x, crop_y = media_top - crop_top, media_right - crop_right
    else:
        crop_x, crop_y = crop_left - media_left, media_top - crop_top
    width, height = (float(value) for value in page.get_size())
    if min(width, height, crop_right - crop_left, crop_top - crop_bottom) <= 0:
        raise PdfRenderError("invalid PDF page geometry")
    return PageGeometry(
        width=width,
        height=height,
        crop_x=crop_x,
        crop_y=crop_y,
        media_width=media_width,
        media_height=media_height,
        crop_left=crop_left,
        crop_bottom=crop_bottom,
        crop_right=crop_right,
        crop_top=crop_top,
        rotation=rotation,
    )


def normalize_object_bbox(
    bounds: tuple[float, float, float, float],
    geometry: PageGeometry,
) -> tuple[float, float, float, float] | None:
    """把未旋转 PDF 对象边界换算为 CropBox 和旋转后的归一化坐标。

    :param bounds: PDFium 返回的左、下、右、上边界
    :param geometry: 页面几何信息
    :return: 左上原点的归一化边界，不可见时为空
    """
    left, bottom, right, top = bounds
    if not all(math.isfinite(value) for value in bounds):
        return None
    left = max(left, geometry.crop_left)
    bottom = max(bottom, geometry.crop_bottom)
    right = min(right, geometry.crop_right)
    top = min(top, geometry.crop_top)
    if right <= left or top <= bottom:
        return None
    crop_width = geometry.crop_right - geometry.crop_left
    crop_height = geometry.crop_top - geometry.crop_bottom
    if geometry.rotation == 90:
        box = (
            bottom - geometry.crop_bottom,
            left - geometry.crop_left,
            top - geometry.crop_bottom,
            right - geometry.crop_left,
        )
        width, height = crop_height, crop_width
    elif geometry.rotation == 180:
        box = (
            geometry.crop_right - right,
            bottom - geometry.crop_bottom,
            geometry.crop_right - left,
            top - geometry.crop_bottom,
        )
        width, height = crop_width, crop_height
    elif geometry.rotation == 270:
        box = (
            geometry.crop_top - top,
            geometry.crop_right - right,
            geometry.crop_top - bottom,
            geometry.crop_right - left,
        )
        width, height = crop_height, crop_width
    else:
        box = (
            left - geometry.crop_left,
            geometry.crop_top - top,
            right - geometry.crop_left,
            geometry.crop_top - bottom,
        )
        width, height = crop_width, crop_height
    normalized = (box[0] / width, box[1] / height, box[2] / width, box[3] / height)
    if not (0 <= normalized[0] < normalized[2] <= 1 and 0 <= normalized[1] < normalized[3] <= 1):
        raise PdfRenderError("invalid normalized image bounds")
    return normalized


def page_image_regions(page: Any, page_no: int) -> list[PdfImageRegion]:
    """按页面内容流顺序读取实际绘制的图片区域，包含 inline image。

    :param page: PDFium 页面对象
    :param page_no: 1 起页码
    :return: 实际可见的图片区域列表
    """
    from pypdfium2_raw import FPDF_PAGEOBJ_IMAGE

    geometry = page_geometry(page)
    regions: list[PdfImageRegion] = []
    for item in page.get_objects():
        if item.type != FPDF_PAGEOBJ_IMAGE:
            continue
        bbox = normalize_object_bbox(item.get_bounds(), geometry)
        if bbox is None:
            continue
        regions.append(PdfImageRegion(region_id=f"p{page_no}-r{len(regions) + 1}", bbox=bbox))
    return regions


def render_pdf_pages_in_process(
    data: bytes,
    page_numbers: list[int],
    *,
    scale: float = 2.0,
    longest_side: int | None = None,
    quality: int = 85,
    max_image_bytes: int = DEFAULT_MAX_IMAGE_BYTES,
    max_total_bytes: int = DEFAULT_MAX_TOTAL_BYTES,
    max_pixels: int = DEFAULT_MAX_PIXELS,
    max_pages: int = 200,
) -> list[RenderedPdfPage]:
    """在当前进程渲染指定页，供受限子进程调用。

    :param data: 原始 PDF 字节
    :param page_numbers: 1 起页码列表
    :param scale: 初始渲染倍率
    :param longest_side: 输出最长边上限，为空时不限制
    :param quality: JPEG 质量
    :param max_image_bytes: 单页 JPEG 字节上限
    :param max_total_bytes: 本次全部 JPEG 字节上限
    :param max_pixels: 单页渲染像素上限
    :param max_pages: 单次渲染页数上限
    :return: 按请求页序排列的渲染结果
    """
    import pypdfium2 as pdfium

    if not data:
        raise PdfRenderError("empty PDF")
    if not page_numbers or len(page_numbers) > max_pages or len(set(page_numbers)) != len(page_numbers):
        raise PdfRenderLimitError("invalid PDF render page count")
    if scale <= 0 or max_image_bytes <= 0 or max_pixels <= 0:
        raise PdfRenderLimitError("invalid PDF render limits")

    document = pdfium.PdfDocument(data)
    rendered: list[RenderedPdfPage] = []
    total_bytes = 0
    try:
        page_count = len(document)
        for page_no in page_numbers:
            if page_no < 1 or page_no > page_count:
                raise PdfPageOutOfRangeError(page_count)
            page = document[page_no - 1]
            try:
                geometry = page_geometry(page)
                regions = page_image_regions(page, page_no)
                current_scale = scale
                if longest_side is not None:
                    current_scale = min(current_scale, longest_side / max(geometry.width, geometry.height))
                image_bytes = b""
                width = height = 0
                for _attempt in range(12):
                    width = max(1, round(geometry.width * current_scale))
                    height = max(1, round(geometry.height * current_scale))
                    if width * height > max_pixels:
                        raise PdfRenderLimitError("PDF render pixel limit exceeded")
                    image_bytes, width, height = _render_jpeg(page, current_scale, quality)
                    if len(image_bytes) <= max_image_bytes:
                        break
                    if width <= 1 and height <= 1:
                        raise PdfRenderLimitError("PDF render byte limit exceeded")
                    ratio = math.sqrt(max_image_bytes / len(image_bytes))
                    current_scale *= max(0.1, min(0.85, ratio * 0.9))
                else:
                    raise PdfRenderLimitError("PDF render byte limit exceeded")
                total_bytes += len(image_bytes)
                if total_bytes > max_total_bytes:
                    raise PdfRenderLimitError("PDF render total byte limit exceeded")
                rendered.append(RenderedPdfPage(
                    page_no=page_no,
                    data=image_bytes,
                    width=width,
                    height=height,
                    sha256=hashlib.sha256(image_bytes).hexdigest(),
                    regions=regions,
                ))
            finally:
                page.close()
    finally:
        document.close()
    return rendered


def _render_jpeg(page: Any, scale: float, quality: int) -> tuple[bytes, int, int]:
    """把一页 PDFium 位图编码为 RGB JPEG。"""
    bitmap = page.render(scale=scale)
    try:
        image = bitmap.to_pil()
        try:
            if image.mode != "RGB":
                image = image.convert("RGB")
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=quality, optimize=True)
            return buffer.getvalue(), image.width, image.height
        finally:
            image.close()
    finally:
        bitmap.close()


def _set_memory_limit(max_memory_mb: int) -> None:
    """在支持的平台上设置子进程虚拟内存上限。"""
    try:
        import resource

        limit_bytes = max_memory_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (limit_bytes, limit_bytes))
    except (ImportError, ValueError, OSError):
        pass


def _render_process(
    data: bytes,
    page_numbers: list[int],
    options: dict[str, Any],
    max_memory_mb: int,
    result_queue: Any,
) -> None:
    """执行子进程渲染并返回可序列化结果。"""
    _set_memory_limit(max_memory_mb)
    try:
        pages = render_pdf_pages_in_process(data, page_numbers, **options)
        result_queue.put(("ok", pages))
    except PdfPageOutOfRangeError as error:
        result_queue.put(("page", error.page_count))
    except MemoryError:
        result_queue.put(("limit", "memory"))
    except PdfRenderLimitError as error:
        result_queue.put(("limit", str(error)))
    except Exception as error:
        result_queue.put(("error", f"{type(error).__name__}: {error}"))


def render_pdf_pages_sync(
    data: bytes,
    page_numbers: list[int],
    *,
    timeout_s: float = 20.0,
    max_memory_mb: int = 512,
    **options: Any,
) -> list[RenderedPdfPage]:
    """在 spawn 子进程中受限渲染指定 PDF 页面。

    :param data: 原始 PDF 字节
    :param page_numbers: 1 起页码列表
    :param timeout_s: 子进程总超时秒数
    :param max_memory_mb: Linux 虚拟内存上限
    :param options: 渲染倍率、质量和输出限制
    :return: 页面 JPEG 与区域元数据
    """
    context = multiprocessing.get_context("spawn")
    result_queue = context.Queue(maxsize=1)
    process = context.Process(
        target=_render_process,
        args=(data, page_numbers, options, max_memory_mb, result_queue),
        daemon=True,
    )
    process.start()
    try:
        status, payload = result_queue.get(timeout=timeout_s)
    except queue.Empty as error:
        if process.is_alive():
            process.kill()
            process.join(timeout=5.0)
            raise PdfRenderTimeoutError("PDF render timeout") from error
        raise PdfRenderError("PDF render subprocess returned no result") from error
    process.join(timeout=5.0)
    if process.is_alive():
        process.kill()
        process.join(timeout=5.0)
    if status == "page":
        raise PdfPageOutOfRangeError(int(payload))
    if status == "limit":
        raise PdfRenderLimitError(str(payload))
    if status != "ok":
        raise PdfRenderError(str(payload))
    return list(payload)
