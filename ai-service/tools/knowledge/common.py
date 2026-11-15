"""知识工具共用的上下文、输出编码与正文读取。

@author 称霸幼儿园
"""

import json
from dataclasses import dataclass
from typing import Any

from retrieval.models import DOC_UNAVAILABLE_MESSAGE, AuthorizationItem
from retrieval.search import HybridSearcher
from retrieval.session import RetrievalSession, RetrievalSessionStore

MAX_CONTENT_PAGES = 100


@dataclass
class KnowledgeToolContext:
    """工具处理器共享的会话仓库与检索管线。

    @author 称霸幼儿园
    """

    store: RetrievalSessionStore
    searcher: HybridSearcher


def dumps(value: Any) -> str:
    """把给模型看的结构化结果编码为紧凑 JSON。

    :param value: 结果
    :return: JSON 文本
    """
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def split_item_key(item_key: str) -> tuple[str, str | None]:
    """把条目键拆成基础引用与附属类型。

    :param item_key: 如 note:1 或 mooc_item:5#transcript
    :return: （基础引用, 附属类型）
    """
    if "#" in item_key:
        ref, subtype = item_key.split("#", 1)
        return ref, subtype or None
    return item_key, None


async def full_text_lines(
    session: RetrievalSession,
    auth: AuthorizationItem,
) -> tuple[list[str], list[int | None], str | None, str | None]:
    """读取已确认可读实体的全文并按行拆分；资料从索引拼回，其余从 note 续读到结束。

    :param session: 检索会话
    :param auth: 第二段权限的可读项
    :return: （行, 每行页码, 标题, 权威性）
    """
    if auth.ref.startswith("doc:"):
        index = session.index_reader(DOC_UNAVAILABLE_MESSAGE)
        chunks = await session.call_index(index.item_chunks(auth.item_key), DOC_UNAVAILABLE_MESSAGE)
        lines: list[str] = []
        pages: list[int | None] = []
        for chunk in chunks:
            for line in chunk.content.split("\n"):
                lines.append(line)
                pages.append(chunk.page_no)
        title = chunks[0].title if chunks else None
        authority = chunks[0].authority if chunks else None
        return lines, pages, title, authority
    parts: list[str] = []
    offset = 0
    title = None
    authority = None
    for _ in range(MAX_CONTENT_PAGES):
        result = await session.call_note(
            session.knowledge.content(
                session.access_token,
                {"ref": auth.ref, "subtype": auth.subtype, "offset": offset},
            )
        )
        title = result.title
        authority = result.authority
        parts.append(result.content)
        if not result.truncated or result.next_offset is None:
            break
        offset = result.next_offset
    lines = "".join(parts).replace("\r\n", "\n").replace("\r", "\n").split("\n")
    return lines, [None] * len(lines), title, authority
