"""知识工具共用的上下文、输出编码与正文读取。

@author 称霸幼儿园
"""

import json
from dataclasses import dataclass
from typing import Any

from harness.models import EvidenceItem
from retrieval.models import DOC_UNAVAILABLE_MESSAGE, AuthorizationItem
from retrieval.search import HybridSearcher
from retrieval.session import RetrievalSession, RetrievalSessionStore

MAX_CONTENT_PAGES = 100
COUNT_LABELS = {"note": "笔记", "doc": "资料", "mooc": "慕课", "task": "任务"}
# 返回列表的知识工具声明的结果完整展示长度，覆盖各工具默认的一页：标题 18 字左右时，
# kb_outline 默认 50 个节点约 8000 字、kb_query 默认 20 行约 4400 字。更大的页由 Harness 保留元数据、整条省略。
RESULT_FULL_CHARS = 10000


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


def counts_summary(counts: dict[str, int]) -> str:
    """把知识库各类内容的数量写成来源摘要，如「笔记 3 · 资料 1」。

    :param counts: note 统计的各类数量
    :return: 摘要文本
    """
    known = [f"{label} {counts[key]}" for key, label in COUNT_LABELS.items() if key in counts]
    other = [f"{key} {value}" for key, value in counts.items() if key not in COUNT_LABELS]
    return " · ".join(known + other)


def register_row(
    session: RetrievalSession,
    *,
    ref: str,
    entity_type: str | None,
    title: str | None,
    kb_id: int | None,
    kb_name: str | None,
    channel: str,
    selected_reason: str,
    subtype: str | None = None,
    summary: str = "",
    locator: dict[str, Any] | None = None,
    authority: str = "original",
    permission_basis: str | None = None,
) -> EvidenceItem | None:
    """把清单、目录或关系结果里的一行登记为可引用的结构化证据。

    行已经过 note 的可读性过滤；不在本次运行显式范围内的行只给模型看，不登记为证据。
    定位符带 ``row`` 标记，避免与同一实体的正文证据共用编号。

    :param session: 检索会话
    :param ref: 实体引用
    :param entity_type: 实体类型，缺省时取附属类型或引用前缀
    :param title: 标题
    :param kb_id: 所属知识库
    :param kb_name: 知识库名称
    :param channel: 记入命中通道的名称
    :param selected_reason: 进入上下文的原因
    :param subtype: 附属类型（字幕或总结）
    :param summary: 服务端生成的来源摘要，作为引用片段展示
    :param locator: 额外定位，空值会被去掉
    :param authority: original、transcript 或 generated
    :param permission_basis: 可读依据
    :return: 证据条目；不在范围内时为空值
    """
    if not session.in_run_scope(ref, kb_id):
        return None
    extra = {key: value for key, value in (locator or {}).items() if value is not None}
    return session.evidence.register(
        item_key=f"{ref}#{subtype}" if subtype else ref,
        entity_type=entity_type or subtype or ref.split(":", 1)[0],
        text=summary,
        title=title,
        locator={"row": True, **extra},
        kb_id=kb_id,
        kb_name=kb_name,
        authority=authority,
        content_version=None,
        stale=False,
        permission_basis=permission_basis,
        retrieval={"channels": {channel: 1}},
        selected_reason=selected_reason,
        structured=True,
    )


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
