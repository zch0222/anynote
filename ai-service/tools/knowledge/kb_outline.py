"""`kb_outline`：知识库目录、慕课章节或单个实体的标题树。

@author 称霸幼儿园
"""

from typing import Any

from harness.action.policy import BoundAction
from harness.action.registry import ToolOutput, ToolSpec
from retrieval.models import DOC_UNAVAILABLE_MESSAGE, ChunkHit, OutlineNode
from retrieval.session import RetrievalSession
from tools.knowledge.args import KbOutlineArgs
from tools.knowledge.common import KnowledgeToolContext, dumps

NAME = "kb_outline"
SUMMARY = "查看目录"
DESCRIPTION = (
    "查看知识库的目录（笔记、资料、慕课、任务），慕课的章节与条目，或单篇笔记、文档类条目的标题树；"
    "资料（PDF）返回按标题或页分组的目录及页码范围。只有标题与标识，不含正文，分页返回。"
    "适合「这个知识库/这门课讲了什么」以及在长文档里先找到小节再用 kb_read 读取。"
)
LIST_REFS = ("kb:", "mooc:")


def group_doc_outline(chunks: list[ChunkHit]) -> list[dict[str, Any]]:
    """把资料片段按连续的标题路径分组；没有标题路径时按页分组。

    :param chunks: 按序号排列的片段
    :return: 目录节点
    """
    nodes: list[dict[str, Any]] = []
    for chunk in chunks:
        key = chunk.section_path if chunk.section_path else f"#page{chunk.page_no}"
        if nodes and nodes[-1]["_key"] == key:
            node = nodes[-1]
        else:
            node = {"_key": key, "sectionPath": chunk.section_path, "pageStart": chunk.page_no,
                    "pageEnd": chunk.page_no}
            nodes.append(node)
        if chunk.page_no is not None:
            node["pageStart"] = chunk.page_no if node["pageStart"] is None else min(node["pageStart"], chunk.page_no)
            node["pageEnd"] = chunk.page_no if node["pageEnd"] is None else max(node["pageEnd"], chunk.page_no)
    for node in nodes:
        node.pop("_key")
    return nodes


def node_payload(node: OutlineNode) -> dict[str, Any]:
    """把 note 目录节点转为给模型的结构。

    :param node: 目录节点
    :return: 节点字典
    """
    return {
        "ref": node.ref,
        "entityType": node.entity_type,
        "title": node.title,
        "parentRef": node.parent_ref,
        "locator": node.locator,
        "updateTime": node.update_time,
    }


async def filter_ordinary(session: RetrievalSession, nodes: list[OutlineNode]) -> list[OutlineNode]:
    """超管默认范围下按普通成员口径过滤实体节点，其他情况原样返回。

    :param session: 检索会话
    :param nodes: 目录节点
    :return: 过滤后的节点
    """
    if not await session.admin_default():
        return nodes
    keys = [node.ref for node in nodes if node.ref]
    passed = await session.ordinary_check(keys)
    return [node for node in nodes if node.ref in passed]


def build(context: KnowledgeToolContext) -> ToolSpec:
    """构造 `kb_outline` 工具。

    :param context: 工具共享上下文
    :return: 工具定义
    """

    async def handle(args: KbOutlineArgs, action: BoundAction) -> ToolOutput:
        session = context.store.for_action(action)
        auth = await session.gate(args.ref, None)
        if args.ref.startswith("doc:"):
            index = session.index_reader(DOC_UNAVAILABLE_MESSAGE)
            chunks = await session.call_index(index.item_chunks(auth.item_key), DOC_UNAVAILABLE_MESSAGE)
            groups = group_doc_outline(chunks)
            start = (args.page_num - 1) * args.page_size
            page = groups[start : start + args.page_size]
            payload = {"ref": args.ref, "nodes": page, "pageNum": args.page_num, "pageSize": args.page_size,
                       "total": len(groups), "hasMore": start + args.page_size < len(groups)}
            return ToolOutput(content=dumps(payload), diagnostics={"nodes": len(page)})
        result = await session.call_note(
            session.knowledge.outline(session.access_token, args.ref, args.parent_id, args.page_num, args.page_size)
        )
        nodes = result.nodes
        if args.ref.startswith(LIST_REFS):
            nodes = await filter_ordinary(session, nodes)
        payload_nodes = []
        for node in nodes:
            entry = node_payload(node)
            if args.depth > 1 and args.ref.startswith(LIST_REFS):
                mooc_ref = args.ref if args.ref.startswith("mooc:") else None
                entry["children"] = await _children(session, args, node, args.depth - 1, mooc_ref)
            payload_nodes.append(entry)
        payload = {"ref": result.ref, "nodes": payload_nodes, "pageNum": result.page_num,
                   "pageSize": result.page_size, "total": result.total, "hasMore": result.has_more}
        return ToolOutput(content=dumps(payload), diagnostics={"nodes": len(payload_nodes)})

    return ToolSpec(
        name=NAME,
        summary=SUMMARY,
        description=DESCRIPTION,
        args_model=KbOutlineArgs,
        handler=handle,
    )


async def _children(
    session: RetrievalSession,
    args: KbOutlineArgs,
    node: OutlineNode,
    depth: int,
    mooc_ref: str | None = None,
) -> list[dict[str, Any]]:
    if depth <= 0 or not node.ref:
        return []
    if node.entity_type == "mooc":
        target, parent_id, owner = node.ref, None, node.ref
    elif node.entity_type == "mooc_item" and mooc_ref:
        target, parent_id, owner = mooc_ref, int(node.ref.split(":", 1)[1]), mooc_ref
    else:
        return []
    result = await session.call_note(
        session.knowledge.outline(session.access_token, target, parent_id, 1, args.page_size)
    )
    children = await filter_ordinary(session, result.nodes)
    payload = []
    for child in children:
        entry = node_payload(child)
        if depth > 1:
            entry["children"] = await _children(session, args, child, depth - 1, owner)
        payload.append(entry)
    return payload
