"""`kb_search`：全文、语义与条目级混合检索。

@author 称霸幼儿园
"""

from harness.action.policy import BoundAction
from harness.action.registry import ToolOutput, ToolSpec
from retrieval.search import SearchRequest
from tools.knowledge.args import KbSearchArgs
from tools.knowledge.common import KnowledgeToolContext, dumps

NAME = "kb_search"
SUMMARY = "检索知识库"
DESCRIPTION = (
    "在可访问的知识库里混合检索（全文 + 语义 + 条目级），返回带编号的证据，正文在证据里。"
    "适合概念性、口语化的问题，以及专有名词、编号；引号里的原话会按短语必须命中。"
    "不适合数数量或列清单（用 kb_query），也不适合在已知的一篇长文档里找某个字面字符串（用 kb_grep）。"
)


def build(context: KnowledgeToolContext) -> ToolSpec:
    """构造 `kb_search` 工具。

    :param context: 工具共享上下文
    :return: 工具定义
    """

    async def handle(args: KbSearchArgs, action: BoundAction) -> ToolOutput:
        session = context.store.for_action(action)
        outcome = await context.searcher.search(
            session,
            SearchRequest(
                query=args.query,
                kb_ids=list(args.kb_ids),
                entity_types=list(args.entity_types),
                granularity=args.granularity,
                updated_after=args.updated_after,
                updated_before=args.updated_before,
                limit=args.limit,
                mode=args.mode,
            ),
        )
        return ToolOutput(
            content=dumps({"results": outcome.results, "notices": outcome.notices}),
            evidence=outcome.evidence,
            diagnostics=outcome.diagnostics,
        )

    return ToolSpec(
        name=NAME,
        summary=SUMMARY,
        description=DESCRIPTION,
        args_model=KbSearchArgs,
        handler=handle,
    )
