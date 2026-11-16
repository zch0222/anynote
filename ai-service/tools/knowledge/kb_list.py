"""`kb_list`：列出可访问的知识库及各类内容数量。

@author 称霸幼儿园
"""

from harness.action.policy import BoundAction
from harness.action.registry import ToolOutput, ToolSpec
from tools.knowledge.args import KbListArgs
from tools.knowledge.common import KnowledgeToolContext, counts_summary, dumps, register_row

NAME = "kb_list"
SUMMARY = "列出可访问的知识库"
DESCRIPTION = (
    "列出本次可以检索的知识库，包含我的角色、笔记/资料/慕课/任务的可读数量和最近更新时间。"
    "适合回答「我有哪些知识库」「各库有多少内容」。不返回正文，不适合查找具体内容。"
)


def build(context: KnowledgeToolContext) -> ToolSpec:
    """构造 `kb_list` 工具。

    :param context: 工具共享上下文
    :return: 工具定义
    """

    async def handle(args: KbListArgs, action: BoundAction) -> ToolOutput:
        session = context.store.for_action(action)
        scope = await session.scope()
        if scope.default_scope:
            stats = await session.call_note(session.knowledge.stats(session.access_token, None))
        elif scope.kb_ids:
            stats = await session.call_note(session.knowledge.stats(session.access_token, scope.kb_ids))
        else:
            return ToolOutput(content=dumps({"knowledgeBases": []}), diagnostics={"knowledgeBases": 0})
        rows = []
        evidence = []
        for item in stats.knowledge_bases:
            row = {
                "kbId": item.kb_id,
                "name": item.name,
                "role": item.role,
                "counts": item.counts,
                "latestUpdateTime": item.latest_update_time,
            }
            cited = register_row(
                session,
                ref=f"kb:{item.kb_id}",
                entity_type="kb",
                title=item.name,
                kb_id=item.kb_id,
                kb_name=item.name or scope.kb_name(item.kb_id),
                channel="list",
                selected_reason=NAME,
                summary=counts_summary(item.counts),
            )
            if cited is not None:
                evidence.append(cited)
                row = {"evidenceId": cited.evidence_id, **row}
            rows.append(row)
        return ToolOutput(
            content=dumps({"knowledgeBases": rows}),
            evidence=evidence,
            diagnostics={"knowledgeBases": len(rows)},
        )

    return ToolSpec(
        name=NAME,
        summary=SUMMARY,
        description=DESCRIPTION,
        args_model=KbListArgs,
        handler=handle,
    )
