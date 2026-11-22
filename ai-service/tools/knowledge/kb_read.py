"""`kb_read`：按标题、行、页或时间范围读取原文。

@author 称霸幼儿园
"""

from typing import Any

from harness.action.plane import ToolExecutionError
from harness.action.policy import BoundAction
from harness.action.registry import ToolOutput, ToolSpec
from harness.models import ActionErrorCategory
from indexing.models import SCANNED_PDF_MESSAGE
from retrieval.models import (
    CONTINUE_READ_MESSAGE,
    DOC_UNAVAILABLE_MESSAGE,
    OCR_TRANSCRIPT_MESSAGE,
    PDF_OCR_DISABLED_MESSAGE,
)
from retrieval.session import RetrievalSession
from retrieval.text import take_chars, utf16_length
from tools.knowledge.args import KbReadArgs
from tools.knowledge.common import KnowledgeToolContext, dumps

NAME = "kb_read"
SUMMARY = "阅读原文"
DESCRIPTION = (
    "读取一个实体的一段原文并作为证据返回：笔记与文档类条目按标题或行范围，资料（PDF）按页码范围，字幕按毫秒时间范围。"
    "单次有长度上限，未读完时返回 nextOffset，续读时传相同范围和 offset。"
    "适合核对引用、读取命中位置的完整小节。不适合在不知道内容在哪时盲读，先用 kb_search 或 kb_outline 定位。"
)


def build(context: KnowledgeToolContext) -> ToolSpec:
    """构造 `kb_read` 工具。

    :param context: 工具共享上下文
    :return: 工具定义
    """

    async def handle(args: KbReadArgs, action: BoundAction) -> ToolOutput:
        session = context.store.for_action(action)
        auth = await session.gate(args.ref, args.subtype)
        if args.ref.startswith("doc:"):
            text, locator, next_offset, title, authority, version, stale, read_notices = await _read_doc(
                session, args, auth,
            )
        else:
            text, locator, next_offset, title, authority, version, stale, read_notices = await _read_content(
                session, args,
            )
        scope = await session.scope()
        item = session.evidence.register(
            item_key=auth.item_key,
            entity_type=args.subtype or args.ref.split(":", 1)[0],
            text=text,
            title=title,
            locator=locator,
            kb_id=auth.kb_id,
            kb_name=scope.kb_name(auth.kb_id),
            authority=authority,
            content_version=version,
            stale=stale,
            permission_basis=auth.permission_basis,
            retrieval={"channels": {"read": 1}},
            selected_reason=NAME,
        )
        notices = list(read_notices)
        if next_offset is not None:
            notices.append(CONTINUE_READ_MESSAGE.format(offset=next_offset))
        payload = {
            "evidenceId": item.evidence_id,
            "ref": args.ref,
            "subtype": args.subtype,
            "title": title,
            "locator": locator,
            "truncated": next_offset is not None,
            "nextOffset": next_offset,
            "notices": notices,
        }
        return ToolOutput(content=dumps(payload), evidence=[item], diagnostics={"chars": len(text)})

    return ToolSpec(
        name=NAME,
        summary=SUMMARY,
        description=DESCRIPTION,
        args_model=KbReadArgs,
        handler=handle,
    )


async def _read_doc(session: RetrievalSession, args: KbReadArgs, auth):
    if args.heading is not None or args.start_line is not None or args.end_line is not None \
            or args.start_time_ms is not None or args.end_time_ms is not None:
        raise ToolExecutionError(ActionErrorCategory.INVALID_ARGUMENTS, "doc supports page range only")
    index = session.index_reader(DOC_UNAVAILABLE_MESSAGE)
    chunks = await session.call_index(
        index.item_chunks(auth.item_key, args.start_page, args.end_page),
        DOC_UNAVAILABLE_MESSAGE,
    )
    if not chunks:
        message = (
            PDF_OCR_DISABLED_MESSAGE
            if not session.ocr_enabled and not session.runtime.visual_read_enabled
            else SCANNED_PDF_MESSAGE
        )
        raise ToolExecutionError(ActionErrorCategory.DEPENDENCY_UNAVAILABLE, message)
    full = "\n".join(chunk.content for chunk in chunks if chunk.content)
    piece, cut = take_chars(full[args.offset:], session.settings.read_max_chars)
    next_offset = args.offset + len(piece) if cut else None
    pages = [chunk.page_no for chunk in chunks if chunk.page_no is not None]
    locator: dict[str, Any] = {"offset": args.offset}
    if pages:
        locator["pageStart"] = min(pages)
        locator["pageEnd"] = max(pages)
    first = chunks[0] if chunks else None
    version = first.content_version if first else None
    stale = bool(first and auth.content_version and first.content_version
                 and auth.content_version != first.content_version)
    has_ocr = any(chunk.extraction_mode == "ocr" for chunk in chunks)
    authority = "transcript" if has_ocr else (first.authority if first else "original")
    notices = [OCR_TRANSCRIPT_MESSAGE] if has_ocr else []
    return piece, locator, next_offset, first.title if first else None, authority, version, stale, notices


async def _read_content(session: RetrievalSession, args: KbReadArgs):
    if args.start_page is not None or args.end_page is not None:
        raise ToolExecutionError(ActionErrorCategory.INVALID_ARGUMENTS, "page range is only for doc")
    request = {
        "ref": args.ref,
        "subtype": args.subtype,
        "heading": args.heading,
        "startLine": args.start_line,
        "endLine": args.end_line,
        "startTimeMs": args.start_time_ms,
        "endTimeMs": args.end_time_ms,
        "offset": args.offset,
    }
    result = await session.call_note(session.knowledge.content(session.access_token, request))
    piece, cut = take_chars(result.content, session.settings.read_max_chars)
    if cut:
        next_offset = args.offset + utf16_length(piece)
    elif result.truncated:
        next_offset = result.next_offset
    else:
        next_offset = None
    locator: dict[str, Any] = {"offset": args.offset}
    for key, value in (("heading", args.heading), ("startLine", args.start_line), ("endLine", args.end_line),
                       ("startTimeMs", args.start_time_ms), ("endTimeMs", args.end_time_ms)):
        if value is not None:
            locator[key] = value
    return piece, locator, next_offset, result.title, result.authority, result.content_version, False, []
