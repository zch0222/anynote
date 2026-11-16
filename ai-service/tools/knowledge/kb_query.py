"""`kb_query`：带类型参数的结构化查询，数量由接口计算。

@author 称霸幼儿园
"""

from typing import Any

from harness.action.policy import BoundAction
from harness.action.registry import ToolOutput, ToolSpec
from tools.knowledge.args import KbQueryArgs
from tools.knowledge.common import KnowledgeToolContext, dumps

NAME = "kb_query"
SUMMARY = "查询知识库清单"
DESCRIPTION = (
    "按实体类型、过滤条件和排序列出知识库里的笔记、资料、慕课、条目、字幕、总结、任务或知识库，可返回总数；"
    "MY_TASKS 返回我的任务及提交状态。回答「有多少」「哪些」「最近更新了什么」「我哪些没交」时使用，"
    "数量以返回的 count 为准，不要自己数行。不理解正文内容，不适合按内容找资料（用 kb_search）。"
)
CLIENT_FILTER_LIMIT = 100


def build(context: KnowledgeToolContext) -> ToolSpec:
    """构造 `kb_query` 工具。

    :param context: 工具共享上下文
    :return: 工具定义
    """

    async def handle(args: KbQueryArgs, action: BoundAction) -> ToolOutput:
        session = context.store.for_action(action)
        scope = await session.scope()
        client_filter = session.run_scope is not None or bool(args.kb_ids)
        if not scope.default_scope and not scope.kb_ids:
            return ToolOutput(content=dumps({"rows": [], "count": 0 if args.with_count else None}))
        request: dict[str, Any] = {
            "entity": args.entity,
            "queryName": args.query_name,
            "kbIds": None if scope.default_scope else scope.kb_ids,
            "filters": args.filters,
            "sort": args.sort,
            "limit": CLIENT_FILTER_LIMIT if client_filter else args.limit,
            "withCount": True if client_filter else args.with_count,
        }
        result = await session.call_note(session.knowledge.query(session.access_token, request))
        rows = [
            row for row in result.rows
            if session.in_run_scope(row.ref, row.kb_id) and (not args.kb_ids or row.kb_id in args.kb_ids)
        ]
        if client_filter:
            complete = result.count is not None and result.count <= len(result.rows)
            count = len(rows) if complete else None
            rows = rows[: args.limit]
        else:
            count = result.count
        evidence = []
        payload_rows = []
        for row in rows:
            item_key = f"{row.ref}#{row.subtype}" if row.subtype else row.ref
            fields = {
                "entityType": row.entity_type,
                "title": row.title,
                "createTime": row.create_time,
                "updateTime": row.update_time,
                "attributes": row.attributes,
            }
            item = session.evidence.register(
                item_key=item_key,
                entity_type=row.entity_type or row.ref.split(":", 1)[0],
                text=dumps(fields),
                title=row.title,
                locator={"queryRow": True, **({"moocId": row.attributes["moocId"]}
                         if row.attributes.get("moocId") is not None else {})},
                kb_id=row.kb_id,
                kb_name=scope.kb_name(row.kb_id),
                authority="original",
                content_version=None,
                stale=False,
                permission_basis=None,
                retrieval={"channels": {"query": 1}},
                selected_reason=NAME,
            )
            evidence.append(item)
            payload_rows.append({"evidenceId": item.evidence_id, "ref": row.ref, "subtype": row.subtype,
                                 "kbId": row.kb_id, **fields})
        payload = {"rows": payload_rows, "count": count if args.with_count else None}
        return ToolOutput(
            content=dumps(payload),
            evidence=evidence,
            diagnostics={"rows": len(payload_rows), "clientFilter": client_filter, "count": count},
        )

    return ToolSpec(
        name=NAME,
        summary=SUMMARY,
        description=DESCRIPTION,
        args_model=KbQueryArgs,
        handler=handle,
    )
