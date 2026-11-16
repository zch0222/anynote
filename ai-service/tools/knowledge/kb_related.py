"""`kb_related`：沿已有的结构关系找相邻实体。

@author 称霸幼儿园
"""

from dataclasses import dataclass, field
from typing import Any

from harness.action.plane import ToolExecutionError
from harness.action.policy import BoundAction
from harness.action.registry import ToolOutput, ToolSpec
from harness.models import ActionErrorCategory, EvidenceItem
from retrieval.models import NOT_FOUND_MESSAGE, AuthorizationItem, KnowledgeScope, OutlineNode, QueryRow
from retrieval.session import RetrievalSession
from retrieval.text import extract_note_links
from tools.knowledge.args import KbRelatedArgs
from tools.knowledge.common import KnowledgeToolContext, dumps, full_text_lines, register_row
from tools.knowledge.kb_outline import cite_node, filter_ordinary, ref_id

NAME = "kb_related"
SUMMARY = "查找关联内容"
DESCRIPTION = (
    "沿数据里已有的结构关系找相邻实体：知识库包含的内容、慕课或章节的下级条目、视频条目的字幕与总结、"
    "我在任务里提交的笔记及版本、笔记正文链接到的笔记、同一上级下的其他实体。只返回标题与标识，不含正文。"
    "不做跨实体推理，也不适合按内容检索（用 kb_search）。"
)
SIBLING_PARENTS = ("note", "doc", "mooc", "task")
ATTACHMENT_AUTHORITY = {"transcript": "transcript", "summary": "generated"}


@dataclass
class _Citer:
    """把关系结果登记为结构化证据，并为结果补上 evidenceId。

    @author 称霸幼儿园
    """

    session: RetrievalSession
    scope: KnowledgeScope
    kb_id: int | None
    evidence: list[EvidenceItem] = field(default_factory=list)

    def node(self, node: OutlineNode, mooc_id: int | None) -> dict[str, Any]:
        """登记目录节点。

        :param node: 目录节点
        :param mooc_id: 节点为慕课条目时所属的慕课
        :return: 节点字典
        """
        entry, item = cite_node(self.session, node, self.kb_id, self.scope.kb_name(self.kb_id), "related", NAME,
                                mooc_id)
        if item is not None:
            self.evidence.append(item)
        return entry

    def entry(
        self,
        entry: dict[str, Any],
        *,
        ref: str,
        subtype: str | None = None,
        entity_type: str | None = None,
        title: str | None = None,
        kb_id: int | None = None,
        mooc_id: int | None = None,
        authority: str = "original",
        permission_basis: str | None = None,
    ) -> dict[str, Any]:
        """登记一条关系结果。

        :param entry: 给模型的结果字典
        :param ref: 实体引用
        :param subtype: 附属类型
        :param entity_type: 实体类型
        :param title: 标题
        :param kb_id: 所属知识库，缺省为起点所在知识库
        :param mooc_id: 实体为慕课条目时所属的慕课
        :param authority: original、transcript 或 generated
        :param permission_basis: 可读依据
        :return: 补上 evidenceId 的结果字典；不在范围内时原样返回
        """
        owner = kb_id if kb_id is not None else self.kb_id
        item = register_row(self.session, ref=ref, subtype=subtype, entity_type=entity_type, title=title,
                            kb_id=owner, kb_name=self.scope.kb_name(owner), channel="related", selected_reason=NAME,
                            locator={"moocId": mooc_id}, authority=authority, permission_basis=permission_basis)
        if item is None:
            return entry
        self.evidence.append(item)
        return {**entry, "evidenceId": item.evidence_id}


def build(context: KnowledgeToolContext) -> ToolSpec:
    """构造 `kb_related` 工具。

    :param context: 工具共享上下文
    :return: 工具定义
    """

    async def handle(args: KbRelatedArgs, action: BoundAction) -> ToolOutput:
        session = context.store.for_action(action)
        origin = await session.gate(args.ref, args.subtype)
        citer = _Citer(session, await session.scope(), origin.kb_id)
        kind = args.ref.split(":", 1)[0]
        if args.relation == "contains":
            _require(kind == "kb")
            entries = await _outline_entries(citer, args.ref, None, args)
        elif args.relation == "children":
            _require(kind in ("mooc", "mooc_item") and args.subtype is None)
            if kind == "mooc":
                entries = await _outline_entries(citer, args.ref, None, args)
            else:
                entries = await _query_children(citer, origin.ref, args)
        elif args.relation == "attachments":
            _require(kind == "mooc_item" and args.subtype is None)
            entries = await _attachments(citer, origin.ref)
        elif args.relation == "submission":
            _require(kind == "task")
            entries = await _submission(citer, origin.ref)
        elif args.relation == "links":
            _require(kind == "note")
            entries = await _links(citer, origin)
        else:
            entries = await _siblings(citer, origin, kind, args)
        payload = {"ref": args.ref, "relation": args.relation, "related": entries}
        return ToolOutput(content=dumps(payload), evidence=citer.evidence, diagnostics={"related": len(entries)})

    return ToolSpec(
        name=NAME,
        summary=SUMMARY,
        description=DESCRIPTION,
        args_model=KbRelatedArgs,
        handler=handle,
    )


def _require(condition: bool) -> None:
    if not condition:
        raise ToolExecutionError(ActionErrorCategory.INVALID_ARGUMENTS, "relation does not apply to this ref")


async def _outline_entries(
    citer: _Citer,
    ref: str,
    parent_id: int | None,
    args: KbRelatedArgs,
    exclude: str | None = None,
) -> list[dict[str, Any]]:
    session = citer.session
    result = await session.call_note(
        session.knowledge.outline(session.access_token, ref, parent_id, args.page_num, args.page_size)
    )
    nodes: list[OutlineNode] = await filter_ordinary(session, result.nodes)
    mooc_id = ref_id(ref) if ref.startswith("mooc:") else None
    return [citer.node(node, mooc_id) for node in nodes if node.ref != exclude]


async def _query_children(citer: _Citer, ref: str, args: KbRelatedArgs,
                          exclude: str | None = None) -> list[dict[str, Any]]:
    parent_id = int(ref.split(":", 1)[1])
    rows = await _query_items(citer.session, {"parentId": parent_id}, args.page_size)
    return [
        citer.entry(_row_payload(row), ref=row.ref, entity_type=row.entity_type, title=row.title, kb_id=row.kb_id,
                    mooc_id=row.attributes.get("moocId"))
        for row in rows
        if row.ref != exclude
    ]


async def _query_items(session: RetrievalSession, filters: dict[str, Any], limit: int) -> list[QueryRow]:
    scope = await session.scope()
    request = {
        "entity": "mooc_item",
        "kbIds": None if scope.default_scope else scope.kb_ids,
        "filters": filters,
        "limit": limit,
    }
    result = await session.call_note(session.knowledge.query(session.access_token, request))
    return [row for row in result.rows if session.in_run_scope(row.ref, row.kb_id)]


def _row_payload(row: QueryRow) -> dict[str, Any]:
    return {"ref": row.ref, "entityType": row.entity_type, "title": row.title, "parentRef": row.parent_ref,
            "updateTime": row.update_time}


async def _readable_refs(session: RetrievalSession, items: list[tuple[str, str | None]]) -> list[AuthorizationItem]:
    readable = await session.authorize(items)
    allowed = [readable[item] for item in items if item in readable
               and session.in_run_scope(item[0], readable[item].kb_id)]
    passed = await session.ordinary_check([item.item_key for item in allowed])
    return [item for item in allowed if item.item_key in passed]


async def _attachments(citer: _Citer, ref: str) -> list[dict[str, Any]]:
    items = await _readable_refs(citer.session, [(ref, "transcript"), (ref, "summary")])
    return [
        citer.entry({"ref": item.ref, "subtype": item.subtype, "kbId": item.kb_id}, ref=item.ref,
                    subtype=item.subtype, kb_id=item.kb_id,
                    authority=ATTACHMENT_AUTHORITY.get(item.subtype or "", "original"),
                    permission_basis=item.permission_basis)
        for item in items
    ]


async def _submission(citer: _Citer, ref: str) -> list[dict[str, Any]]:
    session = citer.session
    scope = await session.scope()
    request = {
        "entity": "task",
        "queryName": "MY_TASKS",
        "kbIds": None if scope.default_scope else scope.kb_ids,
        "limit": 100,
    }
    result = await session.call_note(session.knowledge.query(session.access_token, request))
    row = next((item for item in result.rows if item.ref == ref), None)
    if row is None:
        return []
    note_id = row.attributes.get("submissionNoteId")
    if not note_id:
        return []
    items = await _readable_refs(session, [(f"note:{note_id}", None)])
    return [
        citer.entry(
            {
                "ref": item.ref,
                "kbId": item.kb_id,
                "noteHistoryId": row.attributes.get("noteHistoryId"),
                "submitTime": row.attributes.get("submitTime"),
                "submissionStatus": row.attributes.get("submissionStatus"),
            },
            ref=item.ref,
            kb_id=item.kb_id,
            permission_basis=item.permission_basis,
        )
        for item in items
    ]


async def _links(citer: _Citer, origin: AuthorizationItem) -> list[dict[str, Any]]:
    session = citer.session
    lines, _pages, _title, _authority = await full_text_lines(session, origin)
    links = extract_note_links("\n".join(lines))
    targets = [(f"note:{note_id}", None) for _kb_id, note_id in links if f"note:{note_id}" != origin.ref]
    items = await _readable_refs(session, targets)
    return [
        citer.entry({"ref": item.ref, "kbId": item.kb_id}, ref=item.ref, kb_id=item.kb_id,
                    permission_basis=item.permission_basis)
        for item in items
    ]


async def _siblings(
    citer: _Citer,
    origin: AuthorizationItem,
    kind: str,
    args: KbRelatedArgs,
) -> list[dict[str, Any]]:
    session = citer.session
    if kind in SIBLING_PARENTS:
        if not origin.kb_id:
            return []
        await session.gate(f"kb:{origin.kb_id}", None)
        return await _outline_entries(citer, f"kb:{origin.kb_id}", None, args, exclude=origin.ref)
    _require(kind == "mooc_item" and args.subtype is None)
    index = session.index_reader()
    parent = await session.call_index(index.item_parent(origin.ref))
    if not parent:
        raise ToolExecutionError(ActionErrorCategory.NOT_FOUND, NOT_FOUND_MESSAGE)
    if parent.startswith("mooc:"):
        return await _outline_entries(citer, parent, None, args, exclude=origin.ref)
    return await _query_children(citer, parent, args, exclude=origin.ref)
