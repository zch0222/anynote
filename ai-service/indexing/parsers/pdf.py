"""带子进程隔离与内存/超时限制的 PDF 解析器。

@author 称霸幼儿园
"""

import io
import multiprocessing
import queue
from typing import Any

from indexing.models import (
    PDF_PARSE_LIMIT_MESSAGE,
    SCANNED_PDF_MESSAGE,
    ParsedDocument,
    ParsedSection,
)


class PdfParseError(RuntimeError):
    """PDF 文件损坏或解析异常。

    @author 称霸幼儿园
    """


class PdfParseLimitError(PdfParseError):
    """PDF 解析超时或超出内存限制。

    @author 称霸幼儿园
    """

    def __init__(self, message: str = PDF_PARSE_LIMIT_MESSAGE):
        super().__init__(message)


def _extract_in_process(data: bytes, max_memory_mb: int, result_queue: Any) -> None:
    try:
        import resource

        limit_bytes = max_memory_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (limit_bytes, limit_bytes))
    except (ImportError, ValueError, OSError):
        pass

    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        pages: list[tuple[int, str]] = []
        for idx, page in enumerate(reader.pages, start=1):
            text = (page.extract_text() or "").strip()
            if text:
                pages.append((idx, text))

        if not pages and len(reader.pages) > 0:
            try:
                import pdfplumber

                with pdfplumber.open(io.BytesIO(data)) as pdf:
                    for idx, page in enumerate(pdf.pages, start=1):
                        text = (page.extract_text() or "").strip()
                        if text:
                            pages.append((idx, text))
            except Exception:
                pass

        result_queue.put(("ok", len(reader.pages), pages))
    except MemoryError:
        result_queue.put(("limit", PDF_PARSE_LIMIT_MESSAGE, []))
    except Exception as error:
        result_queue.put(("error", f"{type(error).__name__}: {error}", []))


def extract_pdf_sections_sync(
    data: bytes,
    timeout_s: float = 30.0,
    max_memory_mb: int = 512,
) -> ParsedDocument:
    """在独立子进程中解析 PDF 字节并判定扫描件。

    :param data: PDF 二进制内容
    :param timeout_s: 解析超时秒数
    :param max_memory_mb: 子进程虚拟内存上限（MB）
    :return: 按页组织的解析结果；若疑为扫描件则标记 unextractable=True
    """
    if not data:
        raise PdfParseError("PDF 内容为空")

    ctx = multiprocessing.get_context("spawn")
    result_queue = ctx.Queue(maxsize=1)
    proc = ctx.Process(
        target=_extract_in_process,
        args=(data, max_memory_mb, result_queue),
        daemon=True,
    )
    proc.start()
    proc.join(timeout=timeout_s)

    if proc.is_alive():
        proc.kill()
        proc.join(timeout=5.0)
        raise PdfParseLimitError(PDF_PARSE_LIMIT_MESSAGE)

    try:
        status, payload, pages = result_queue.get_nowait()
    except queue.Empty as error:
        if proc.exitcode not in (0, None):
            raise PdfParseLimitError(PDF_PARSE_LIMIT_MESSAGE) from error
        raise PdfParseError("PDF 解析子进程未返回结果") from error

    if status == "limit":
        raise PdfParseLimitError(str(payload))
    if status != "ok":
        raise PdfParseError(str(payload))

    if not pages:
        return ParsedDocument(
            sections=[],
            unextractable=True,
            reason=SCANNED_PDF_MESSAGE,
        )

    sections = [
        ParsedSection(text=text, page_no=page_no)
        for page_no, text in pages
        if text.strip()
    ]
    return ParsedDocument(sections=sections)


async def parse_pdf_bytes(
    data: bytes,
    timeout_s: float = 30.0,
    max_memory_mb: int = 512,
) -> ParsedDocument:
    """异步包装子进程 PDF 提取。

    :param data: PDF 字节数据
    :param timeout_s: 超时秒数
    :param max_memory_mb: 子进程内存上限（MB）
    :return: 解析结果
    """
    import asyncio

    return await asyncio.to_thread(extract_pdf_sections_sync, data, timeout_s, max_memory_mb)
