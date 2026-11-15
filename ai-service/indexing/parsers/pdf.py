"""带子进程隔离与内存/超时限制的 PDF 解析器（pdfplumber 提取正文，pypdf 读取书签）。

@author 称霸幼儿园
"""

import io
import multiprocessing
import queue
import re
import statistics
from dataclasses import dataclass
from typing import Any

from indexing.models import (
    PDF_PARSE_LIMIT_MESSAGE,
    SCANNED_PDF_MESSAGE,
    ParsedDocument,
    ParsedSection,
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


@dataclass(slots=True)
class PdfLine:
    """页面上的一行文本及其平均字号。

    @author 称霸幼儿园
    """

    text: str
    size: float


@dataclass(slots=True)
class PdfBookmark:
    """PDF 书签条目。

    @author 称霸幼儿园
    """

    title: str
    page_no: int
    level: int


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
        lines.append(PdfLine(text=_join_cjk(text), size=sum(sizes) / len(sizes) if sizes else 0.0))
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
    """判定一行是否为标题：字号够大、足够短、不以句末标点结尾。

    :param line: 文本行
    :param body_size: 所在页正文字号
    :return: 是否为标题
    """
    text = line.text.strip()
    if not text or body_size <= 0:
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
    """把逐页文本行组装为带标题路径与页码的段落。

    有书签时用书签作为标题树，否则按字号识别标题；标题行本身不进入正文。

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
        buffer: list[str] = []
        for line in lines:
            if is_heading_line(line, body):
                _flush(sections, buffer, stack, page_no)
                level = levels.get(_round_size(line.size), HEADING_MAX_LEVELS)
                while stack and stack[-1][0] >= level:
                    stack.pop()
                stack.append((level, line.text.strip()))
                continue
            buffer.append(line.text)
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
        line_titles = {_normalize(line.text) for line in lines}
        pending = [bookmark for bookmark in on_page if _normalize(bookmark.title) in line_titles]
        for bookmark in on_page:
            if bookmark not in pending:
                _push(stack, bookmark)
        buffer: list[str] = []
        for line in lines:
            match = next(
                (bookmark for bookmark in pending if _normalize(bookmark.title) == _normalize(line.text)),
                None,
            )
            if match is not None:
                _flush(sections, buffer, stack, page_no)
                _push(stack, match)
                pending.remove(match)
                continue
            buffer.append(line.text)
        _flush(sections, buffer, stack, page_no)
    return sections


def _push(stack: list[tuple[int, str]], bookmark: PdfBookmark) -> None:
    while stack and stack[-1][0] >= bookmark.level:
        stack.pop()
    stack.append((bookmark.level, bookmark.title.strip()))


def _flush(
    sections: list[ParsedSection],
    buffer: list[str],
    stack: list[tuple[int, str]],
    page_no: int,
) -> None:
    text = "\n".join(buffer).strip()
    buffer.clear()
    if not text:
        return
    path = SECTION_PATH_SEPARATOR.join(title for _level, title in stack) or None
    sections.append(ParsedSection(text=text, section_path=path, page_no=page_no))


def _round_size(size: float) -> float:
    return round(size * 2) / 2


def _normalize(text: str) -> str:
    return re.sub(r"\s+", "", text or "")


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


def _extract_in_process(data: bytes, max_memory_mb: int, result_queue: Any) -> None:
    try:
        import resource

        limit_bytes = max_memory_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (limit_bytes, limit_bytes))
    except (ImportError, ValueError, OSError):
        pass

    try:
        import pdfplumber
        from pypdf import PdfReader

        bookmarks = _read_bookmarks(PdfReader(io.BytesIO(data)))
        pages: list[tuple[int, list[tuple[str, float]], float]] = []
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            page_count = len(pdf.pages)
            for page_no, page in enumerate(pdf.pages, start=1):
                words = page.extract_words(extra_attrs=["size"], keep_blank_chars=False, use_text_flow=False)
                if not words:
                    continue
                body = body_font_size(words)
                lines: list[tuple[str, float]] = []
                for column in split_columns(words, float(page.width)):
                    lines.extend((line.text, line.size) for line in group_lines(column))
                if lines:
                    pages.append((page_no, lines, body))
        result_queue.put(("ok", page_count, pages, bookmarks))
    except MemoryError:
        result_queue.put(("limit", PDF_PARSE_LIMIT_MESSAGE, [], []))
    except Exception as error:
        result_queue.put(("error", f"{type(error).__name__}: {error}", [], []))


def extract_pdf_sections_sync(
    data: bytes,
    timeout_s: float = 30.0,
    max_memory_mb: int = 512,
) -> ParsedDocument:
    """在独立子进程中解析 PDF 字节并判定扫描件。

    :param data: PDF 二进制内容
    :param timeout_s: 解析超时秒数
    :param max_memory_mb: 子进程虚拟内存上限（MB）
    :return: 带标题路径与页码的解析结果；疑为扫描件时标记 unextractable=True
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
        status, payload, pages, bookmarks = result_queue.get_nowait()
    except queue.Empty as error:
        if proc.exitcode not in (0, None):
            raise PdfParseLimitError(PDF_PARSE_LIMIT_MESSAGE) from error
        raise PdfParseError("PDF 解析子进程未返回结果") from error

    if status == "limit":
        raise PdfParseLimitError(str(payload))
    if status != "ok":
        raise PdfParseError(str(payload))

    page_lines = [
        (page_no, [PdfLine(text=text, size=size) for text, size in lines], body)
        for page_no, lines, body in pages
    ]
    sections = build_pdf_sections(
        page_lines,
        [PdfBookmark(title=title, page_no=page_no, level=level) for title, page_no, level in bookmarks],
    )
    if not sections:
        return ParsedDocument(
            sections=[],
            unextractable=True,
            reason=SCANNED_PDF_MESSAGE,
        )
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
