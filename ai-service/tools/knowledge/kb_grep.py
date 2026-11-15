"""`kb_grep`：在一个实体或一个知识库里查找字面字符串。

@author 称霸幼儿园
"""

from typing import Any

from harness.action.policy import BoundAction
from harness.action.registry import ToolOutput, ToolSpec
from retrieval.models import NO_MATCH_MESSAGE, AuthorizationItem
from retrieval.session import RetrievalSession
from retrieval.text import grep_lines
from tools.knowledge.args import KbGrepArgs
from tools.knowledge.common import KnowledgeToolContext, dumps, full_text_lines, split_item_key

NAME = "kb_grep"
SUMMARY = "在原文中查找"
DESCRIPTION = (
    "在一个实体（ref）或一个知识库（kb_id）里查找字面字符串，返回命中行、行号和前后几行，每处命中是一条证据。"
    "适合公式、代码片段、型号、带特殊符号的名称，或在一份长文档里定位某个词。"
    "只做字面匹配，不支持正则；不适合概念性的问题（用 kb_search）。"
)


def build(context: KnowledgeToolContext) -> ToolSpec:
    """构造 `kb_grep` 工具。

    :param context: 工具共享上下文
    :return: 工具定义
    """

    async def handle(args: KbGrepArgs, action: BoundAction) -> ToolOutput:
        session = context.store.for_action(action)
        settings = session.settings
        context_lines = min(
            settings.grep_context_default if args.context_lines is None else args.context_lines,
            settings.grep_context_max,
        )
        if args.ref is not None:
            targets = [await session.gate(args.ref, args.subtype)]
            candidates = 1
        else:
            targets, candidates = await _kb_targets(session, args)
        scope = await session.scope()
        evidence = []
        results: list[dict[str, Any]] = []
        remaining = settings.grep_max_hits
        truncated = False
        for auth in targets:
            if remaining <= 0:
                truncated = True
                break
            lines, pages, title, authority = await full_text_lines(session, auth)
            hits, cut = grep_lines(lines, args.pattern, args.ignore_case, context_lines, remaining, pages)
            truncated = truncated or cut
            remaining -= len(hits)
            for hit in hits:
                locator: dict[str, Any] = {"line": hit.line_no, "startLine": hit.start_line, "endLine": hit.end_line}
                if hit.page_no is not None:
                    locator["pageNo"] = hit.page_no
                item = session.evidence.register(
                    item_key=auth.item_key,
                    entity_type=auth.subtype or auth.ref.split(":", 1)[0],
                    text=hit.text,
                    title=title,
                    locator=locator,
                    kb_id=auth.kb_id,
                    kb_name=scope.kb_name(auth.kb_id),
                    authority=authority,
                    content_version=auth.content_version,
                    stale=False,
                    permission_basis=auth.permission_basis,
                    retrieval={"channels": {"grep": 1}},
                    selected_reason=NAME,
                )
                evidence.append(item)
                results.append({"evidenceId": item.evidence_id, "ref": auth.ref, "subtype": auth.subtype,
                                "title": title, "locator": locator})
        payload = {"results": results, "truncated": truncated, "notices": [] if results else [NO_MATCH_MESSAGE]}
        return ToolOutput(
            content=dumps(payload),
            evidence=evidence,
            diagnostics={"candidates": candidates, "scanned": len(targets), "hits": len(results)},
        )

    return ToolSpec(
        name=NAME,
        summary=SUMMARY,
        description=DESCRIPTION,
        args_model=KbGrepArgs,
        handler=handle,
    )


async def _kb_targets(session: RetrievalSession, args: KbGrepArgs) -> tuple[list[AuthorizationItem], int]:
    index = session.index_reader()
    filters = [*await session.prefilter(), {"term": {"kb_id": args.kb_id}}]
    item_keys = await session.call_index(
        index.phrase_candidates(args.pattern, filters, session.settings.grep_kb_candidates)
    )
    requests = [split_item_key(key) for key in item_keys]
    readable = await session.authorize(requests)
    targets = [
        readable[request] for request in requests
        if request in readable and session.in_run_scope(request[0], readable[request].kb_id)
    ]
    return targets, len(item_keys)
