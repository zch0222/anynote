"""七个知识工具经行动面执行的成功与失败路径。

@author 称霸幼儿园
"""

import json

import pytest
from elastic_transport import ConnectionError as TransportConnectionError

from clients._internal import InternalServiceError
from harness.action.plane import ActionPlane, FatalActionError
from harness.models import ActionErrorCategory, ActionStatus, RunScope, ToolCall
from models.openai_compatible import ModelServiceError
from retrieval.models import (
    CONTINUE_READ_MESSAGE,
    DOC_UNAVAILABLE_MESSAGE,
    NO_MATCH_MESSAGE,
    NOT_FOUND_MESSAGE,
    SEARCH_UNAVAILABLE_MESSAGE,
    SEMANTIC_UNAVAILABLE_MESSAGE,
    STALE_MESSAGE,
    ContentResult,
    KnowledgeScope,
    OutlineNode,
    OutlineResult,
    QueryResult,
    QueryRow,
    ScopeKnowledgeBase,
    StatsKnowledgeBase,
    StatsResult,
)
from retrieval.session import RetrievalSessionMiddleware
from tests.knowledge_fakes import (
    FakeEmbedder,
    FakeIndexReader,
    FakeKnowledgeClient,
    chunk,
    make_tool_run,
    make_toolkit,
    snapshot,
)
from tools.knowledge import KNOWLEDGE_TOOL_NAMES

EXPECTED_SUMMARIES = {
    "kb_list": "列出可访问的知识库",
    "kb_outline": "查看目录",
    "kb_search": "检索知识库",
    "kb_grep": "在原文中查找",
    "kb_read": "阅读原文",
    "kb_query": "查询知识库清单",
    "kb_related": "查找关联内容",
}


async def _call(registry, run, name: str, arguments: dict, call_id: str = "c1"):
    return await ActionPlane(registry).execute(run, ToolCall(call_id=call_id, name=name, arguments=arguments))


def _payload(result) -> dict:
    return json.loads(result.content)


def test_registers_seven_read_only_tools_with_confirmed_summaries():
    """注册七个只读工具，用户可见的一句话说明与确认文案一致。"""
    registry, _store = make_toolkit(FakeKnowledgeClient(), FakeIndexReader())
    for name in KNOWLEDGE_TOOL_NAMES:
        spec = registry.get(name)
        assert spec is not None and spec.read_only
        assert spec.summary == EXPECTED_SUMMARIES[name]
        assert "不适合" in spec.description or "不含正文" in spec.description or "不做" in spec.description


async def test_search_returns_evidence_drops_unreadable_and_marks_stale():
    """检索返回编号证据，第二段不可读的被丢弃，版本不一致的标记滞后。"""
    client = FakeKnowledgeClient()
    client.allow("note:1", version="v2")
    index = FakeIndexReader()
    index.lexical_hits = [chunk("note:1", 0, "第一段"), chunk("note:2", 0, "无权内容")]
    index.chunks = {"note:1": [chunk("note:1", 0, "第一段"), chunk("note:1", 1, "第二段")]}
    registry, _store = make_toolkit(client, index)

    result = await _call(registry, make_tool_run(), "kb_search", {"query": "期末复习资料整理计划表"})

    assert result.status == ActionStatus.SUCCESS
    payload = _payload(result)
    assert [item["ref"] for item in payload["results"]] == ["note:1"]
    assert payload["results"][0]["stale"] is True
    assert STALE_MESSAGE in payload["notices"]
    assert SEMANTIC_UNAVAILABLE_MESSAGE not in payload["notices"]
    evidence = result.evidence[0]
    assert evidence.evidence_id == "E1"
    assert evidence.content == "第一段\n第二段"
    assert evidence.locator == {"chunkStart": 0, "chunkEnd": 1}
    assert evidence.kb_name == "库一"
    assert result.diagnostics["dropped"] == 1
    assert result.diagnostics["semantic"] == "disabled"
    assert "无权内容" not in result.content


async def test_search_uses_semantic_channel_when_index_matches_model():
    """嵌入模型与激活索引一致时语义通道参与召回。"""
    client = FakeKnowledgeClient()
    client.allow("note:3")
    index = FakeIndexReader()
    index.embedding = ("emb", 3)
    index.semantic_hits = [chunk("note:3", 0, "语义命中")]
    embedder = FakeEmbedder()
    registry, _store = make_toolkit(client, index, embedder)

    result = await _call(registry, make_tool_run(snap=snapshot(embedding=True)), "kb_search",
                         {"query": "倒排索引和正排索引有什么区别"})

    assert embedder.calls == 1
    assert _payload(result)["results"][0]["ref"] == "note:3"
    assert result.diagnostics["semantic"] == "ok"
    assert result.diagnostics["channels"]["semantic"] == 1


async def test_search_disables_semantic_with_retained_index_vectors():
    """关闭嵌入后停止语义检索并保留第二段权限确认。

    @author 称霸幼儿园
    """
    client = FakeKnowledgeClient()
    client.allow("note:1")
    index = FakeIndexReader()
    index.embedding = ("emb", 3)
    index.lexical_hits = [chunk("note:1", 0), chunk("note:2", 0, "无权内容")]
    embedder = FakeEmbedder()
    registry, _store = make_toolkit(client, index, embedder)
    disabled = snapshot(embedding=True)
    disabled.logical_models["embedding"].enabled = False

    result = await _call(registry, make_tool_run(snap=disabled), "kb_search",
                         {"query": "什么是倒排索引的基本原理", "mode": "semantic"})

    assert result.status == ActionStatus.SUCCESS
    assert embedder.calls == 0
    assert not any(name == "semantic" for name, _args in index.calls)
    assert result.diagnostics["semantic"] == "disabled"
    assert result.diagnostics["dropped"] == 1
    assert [item["ref"] for item in _payload(result)["results"]] == ["note:1"]
    assert SEMANTIC_UNAVAILABLE_MESSAGE not in _payload(result)["notices"]


async def test_search_falls_back_to_lexical_when_embedding_fails():
    """嵌入服务出错时只走全文并提示语义检索暂不可用。"""
    client = FakeKnowledgeClient()
    client.allow("note:1")
    index = FakeIndexReader()
    index.embedding = ("emb", 3)
    index.lexical_hits = [chunk("note:1", 0)]
    registry, _store = make_toolkit(client, index, FakeEmbedder(error=ModelServiceError(retryable=True)))

    result = await _call(registry, make_tool_run(snap=snapshot(embedding=True)), "kb_search",
                         {"query": "什么是倒排索引的基本原理", "mode": "semantic"})

    payload = _payload(result)
    assert SEMANTIC_UNAVAILABLE_MESSAGE in payload["notices"]
    assert payload["results"][0]["ref"] == "note:1"
    assert "semantic" in result.diagnostics["degraded"]


async def test_search_reports_dependency_unavailable_when_index_down():
    """Elasticsearch 不可用时返回检索通道不可用，可换用其他工具。"""
    index = FakeIndexReader()
    index.error = TransportConnectionError("down")
    registry, _store = make_toolkit(FakeKnowledgeClient(), index)

    result = await _call(registry, make_tool_run(), "kb_search", {"query": "索引"})

    assert result.status == ActionStatus.FAILED
    assert result.error_category == ActionErrorCategory.DEPENDENCY_UNAVAILABLE
    assert result.content == SEARCH_UNAVAILABLE_MESSAGE


async def test_search_without_hits_returns_no_match_notice():
    """没有命中时返回空结果与未找到提示。"""
    registry, _store = make_toolkit(FakeKnowledgeClient(), FakeIndexReader())
    result = await _call(registry, make_tool_run(), "kb_search", {"query": "索引"})
    assert _payload(result) == {"results": [], "notices": [NO_MATCH_MESSAGE]}


async def test_note_outage_during_authorization_is_fatal():
    """第二段权限确认时 note 不可用，抛出不可降级错误。"""
    client = FakeKnowledgeClient()
    index = FakeIndexReader()
    index.lexical_hits = [chunk("note:1", 0)]
    registry, _store = make_toolkit(client, index)
    run = make_tool_run()
    await _call(registry, run, "kb_list", {})
    client.error = InternalServiceError("anynote-note", "ConnectError")

    with pytest.raises(FatalActionError) as captured:
        await _call(registry, run, "kb_search", {"query": "索引"})
    assert captured.value.category == "KNOWLEDGE_ACCESS_UNAVAILABLE"


async def test_read_note_truncates_and_returns_java_offset():
    """读取笔记超过单次上限时截断，续读位置按 Java 字符计算并附提示。"""
    client = FakeKnowledgeClient()
    client.allow("note:1")
    client.contents["note:1"] = [ContentResult(ref="note:1", title="笔记", authority="original",
                                               contentVersion="v1", content="😀" + "字" * 600)]
    registry, _store = make_toolkit(client, FakeIndexReader())
    run = make_tool_run(snap=snapshot(readMaxChars=500))

    result = await _call(registry, run, "kb_read", {"ref": "note:1", "heading": "第一章"})

    payload = _payload(result)
    assert payload["nextOffset"] == 501
    assert payload["notices"] == [CONTINUE_READ_MESSAGE.format(offset=501)]
    assert len(result.evidence[0].content) == 500
    assert result.evidence[0].locator == {"offset": 0, "heading": "第一章"}
    assert client.calls[-1][1]["heading"] == "第一章"


async def test_read_unreadable_or_notice_is_not_found():
    """不可读实体与通知引用都按不存在或不可读处理。"""
    registry, _store = make_toolkit(FakeKnowledgeClient(), FakeIndexReader())
    for ref in ("note:404", "notice:1"):
        result = await _call(registry, make_tool_run(), "kb_read", {"ref": ref})
        assert result.error_category == ActionErrorCategory.NOT_FOUND
        assert result.content == NOT_FOUND_MESSAGE


async def test_read_outside_run_scope_is_not_found():
    """显式范围之外的实体即使可读也不返回。"""
    client = FakeKnowledgeClient()
    client.allow("note:9", kb_id=66)
    registry, _store = make_toolkit(client, FakeIndexReader())
    result = await _call(registry, make_tool_run(scope=RunScope(knowledgeBaseIds=[1])), "kb_read", {"ref": "note:9"})
    assert result.error_category == ActionErrorCategory.NOT_FOUND


async def test_read_admin_default_requires_ordinary_check():
    """超管默认范围下按引用读取须通过普通成员口径复核。"""
    client = FakeKnowledgeClient(KnowledgeScope(userId=12, admin=True, defaultScope=True, knowledgeBases=[]))
    client.allow("note:5", basis="ADMIN")
    index = FakeIndexReader()
    index.passing = set()
    registry, _store = make_toolkit(client, index)
    result = await _call(registry, make_tool_run(), "kb_read", {"ref": "note:5"})
    assert result.error_category == ActionErrorCategory.NOT_FOUND
    assert ("matching", ["note:5"]) in index.calls


async def test_read_doc_pages_from_index_and_rejects_heading():
    """资料按页从索引拼回原文；资料不支持标题读取；索引不可用时提示资料正文暂不可读取。"""
    client = FakeKnowledgeClient()
    client.allow("doc:4")
    index = FakeIndexReader()
    index.chunks = {"doc:4": [chunk("doc:4", 0, "第一页", "doc", page=1), chunk("doc:4", 1, "第二页", "doc", page=2)]}
    registry, _store = make_toolkit(client, index)

    result = await _call(registry, make_tool_run(), "kb_read", {"ref": "doc:4", "start_page": 2, "end_page": 2})
    assert result.evidence[0].content == "第二页"
    assert result.evidence[0].locator == {"offset": 0, "pageStart": 2, "pageEnd": 2}

    invalid = await _call(registry, make_tool_run(run_id="r2"), "kb_read", {"ref": "doc:4", "heading": "一"})
    assert invalid.error_category == ActionErrorCategory.INVALID_ARGUMENTS

    index.error = TransportConnectionError("down")
    down = await _call(registry, make_tool_run(run_id="r3"), "kb_read", {"ref": "doc:4"})
    assert down.error_category == ActionErrorCategory.DEPENDENCY_UNAVAILABLE
    assert down.content == DOC_UNAVAILABLE_MESSAGE


async def test_read_range_error_is_returned_to_model():
    """note 返回范围参数错误时交还模型修正。"""
    client = FakeKnowledgeClient()
    client.allow("note:1")
    registry, _store = make_toolkit(client, FakeIndexReader())

    async def bad_content(access_token, request):
        raise InternalServiceError("anynote-note", "正文读取范围不合法", "A0160")

    client.content = bad_content
    result = await _call(registry, make_tool_run(), "kb_read", {"ref": "note:1", "start_line": 9})
    assert result.error_category == ActionErrorCategory.INVALID_ARGUMENTS
    assert result.content == "正文读取范围不合法"


async def test_read_rejects_mixed_ranges():
    """标题与行范围同时出现时参数校验失败。"""
    registry, _store = make_toolkit(FakeKnowledgeClient(), FakeIndexReader())
    result = await _call(registry, make_tool_run(), "kb_read", {"ref": "note:1", "heading": "a", "start_line": 1})
    assert result.error_category == ActionErrorCategory.INVALID_ARGUMENTS


async def test_grep_single_entity_reads_all_pages():
    """单个实体内查找会续读到结束，返回行号与上下文，每处命中一条证据。"""
    client = FakeKnowledgeClient()
    client.allow("note:1")
    client.contents["note:1"] = [
        ContentResult(ref="note:1", title="笔记", content="a\nE=mc^2\n", truncated=True, nextOffset=9),
        ContentResult(ref="note:1", title="笔记", content="b\nE=mc^2", truncated=False),
    ]
    registry, _store = make_toolkit(client, FakeIndexReader())

    result = await _call(registry, make_tool_run(), "kb_grep", {"pattern": "E=mc^2", "ref": "note:1",
                                                                 "context_lines": 1})

    payload = _payload(result)
    assert [item["locator"]["line"] for item in payload["results"]] == [2, 4]
    assert result.evidence[0].content == "a\nE=mc^2\nb"
    assert client.count("content") == 2


async def test_grep_knowledge_base_uses_phrase_candidates():
    """库范围查找先用短语匹配缩小候选，再经第二段权限确认后扫描。"""
    client = FakeKnowledgeClient()
    client.allow("note:2")
    client.contents["note:2"] = [ContentResult(ref="note:2", title="n2", content="型号 X-200")]
    index = FakeIndexReader()
    index.phrase_keys = ["note:2", "note:3"]
    registry, _store = make_toolkit(client, index)

    result = await _call(registry, make_tool_run(), "kb_grep", {"pattern": "X-200", "kb_id": 1})

    assert [item["ref"] for item in _payload(result)["results"]] == ["note:2"]
    assert result.diagnostics == {"candidates": 2, "scanned": 1, "hits": 1}


async def test_grep_requires_exactly_one_scope_and_reports_no_match():
    """ref 与 kb_id 必须二选一；无命中时返回未找到提示。"""
    client = FakeKnowledgeClient()
    client.allow("note:1")
    client.contents["note:1"] = [ContentResult(ref="note:1", content="abc")]
    registry, _store = make_toolkit(client, FakeIndexReader())
    invalid = await _call(registry, make_tool_run(), "kb_grep", {"pattern": "a", "ref": "note:1", "kb_id": 1})
    assert invalid.error_category == ActionErrorCategory.INVALID_ARGUMENTS
    empty = await _call(registry, make_tool_run(run_id="r2"), "kb_grep", {"pattern": "zzz", "ref": "note:1"})
    assert _payload(empty)["notices"] == [NO_MATCH_MESSAGE]


async def test_query_default_scope_passes_through_count():
    """默认范围直接使用 note 的计数，结果行成为证据。"""
    client = FakeKnowledgeClient()
    client.query_result = QueryResult(rows=[QueryRow(ref="task:4", entityType="task", kbId=1, title="任务",
                                                     attributes={"submissionStatus": 0})], count=7)
    registry, _store = make_toolkit(client, FakeIndexReader())

    result = await _call(registry, make_tool_run(), "kb_query",
                         {"entity": "task", "query_name": "MY_TASKS", "with_count": True})

    payload = _payload(result)
    assert payload["count"] == 7
    assert payload["rows"][0]["evidenceId"] == "E1"
    request = client.calls[-1][1]
    assert request["kbIds"] is None and request["limit"] == 20 and request["withCount"] is True
    evidence = result.evidence[0]
    assert evidence.structured is True
    assert evidence.source_id == "task:4"
    assert evidence.title == "任务"
    assert evidence.locator == {"row": True}
    assert evidence.content == ""


async def test_query_explicit_scope_filters_rows_and_recounts():
    """显式范围下按范围过滤并重算数量；数据不完整时数量为空。"""
    scope = KnowledgeScope(userId=7, defaultScope=False, knowledgeBases=[
        ScopeKnowledgeBase(kbId=1, role="READ", explicit=True), ScopeKnowledgeBase(kbId=2, role="READ", explicit=True)])
    client = FakeKnowledgeClient(scope)
    rows = [QueryRow(ref="note:1", kbId=1, title="a"), QueryRow(ref="note:2", kbId=2, title="b")]
    client.query_result = QueryResult(rows=rows, count=2)
    registry, _store = make_toolkit(client, FakeIndexReader())

    result = await _call(registry, make_tool_run(scope=RunScope(knowledgeBaseIds=[1, 2])), "kb_query",
                         {"entity": "note", "kb_ids": [2], "with_count": True})
    assert _payload(result)["count"] == 1
    assert client.calls[-1][1]["kbIds"] == [1, 2]

    client.query_result = QueryResult(rows=rows, count=300)
    partial = await _call(registry, make_tool_run(scope=RunScope(knowledgeBaseIds=[1, 2]), run_id="r2"), "kb_query",
                          {"entity": "note", "kb_ids": [2], "with_count": True})
    assert _payload(partial)["count"] is None


async def test_list_uses_default_or_explicit_stats():
    """默认范围按默认统计，显式范围按范围内知识库统计，空范围不调用。"""
    client = FakeKnowledgeClient()
    client.stats_result = StatsResult(knowledgeBases=[StatsKnowledgeBase(kbId=1, name="库一", role="EDIT",
                                                                        counts={"note": 3})])
    registry, _store = make_toolkit(client, FakeIndexReader())
    result = await _call(registry, make_tool_run(), "kb_list", {})
    assert _payload(result)["knowledgeBases"][0]["counts"] == {"note": 3}
    assert client.calls[-1] == ("stats", None)

    explicit = FakeKnowledgeClient(KnowledgeScope(userId=7, defaultScope=False, knowledgeBases=[]))
    registry2, _ = make_toolkit(explicit, FakeIndexReader())
    empty = await _call(registry2, make_tool_run(scope=RunScope(knowledgeBaseIds=[9])), "kb_list", {})
    assert _payload(empty) == {"knowledgeBases": []}
    assert explicit.count("stats") == 0


async def test_list_rows_are_citable_knowledge_base_evidence():
    """每个知识库登记为一条可引用的结构化证据，摘要由各类数量生成。"""
    client = FakeKnowledgeClient()
    client.stats_result = StatsResult(knowledgeBases=[
        StatsKnowledgeBase(kbId=1, name="库一", role="EDIT", counts={"note": 3, "doc": 1, "mooc": 0, "task": 2}),
        StatsKnowledgeBase(kbId=2, name="库二", role="READ", counts={"note": 1}),
    ])
    registry, _store = make_toolkit(client, FakeIndexReader())

    result = await _call(registry, make_tool_run(), "kb_list", {})

    rows = _payload(result)["knowledgeBases"]
    assert [row["evidenceId"] for row in rows] == ["E1", "E2"]
    first = result.evidence[0]
    assert (first.source_type, first.source_id, first.title, first.kb_id, first.kb_name) == (
        "kb", "kb:1", "库一", 1, "库一")
    assert first.structured is True
    assert first.content == "笔记 3 · 资料 1 · 慕课 0 · 任务 2"
    assert result.evidence[1].content == "笔记 1"


async def test_list_leaves_knowledge_bases_outside_explicit_refs_uncited():
    """只按资料限定范围时，资料所在的知识库仍可列出，但不作为可引用证据。"""
    scope = KnowledgeScope(userId=7, defaultScope=False, knowledgeBases=[ScopeKnowledgeBase(kbId=1, name="库一")])
    client = FakeKnowledgeClient(scope)
    client.stats_result = StatsResult(knowledgeBases=[StatsKnowledgeBase(kbId=1, name="库一", counts={"doc": 1})])
    registry, _store = make_toolkit(client, FakeIndexReader())

    result = await _call(registry, make_tool_run(scope=RunScope(refs=["doc:4"])), "kb_list", {})

    assert "evidenceId" not in _payload(result)["knowledgeBases"][0]
    assert result.evidence == []


async def test_outline_kb_with_mooc_children():
    """知识库目录展开两层时附带慕课的章节。"""
    client = FakeKnowledgeClient()
    client.allow("kb:1", kb_id=1)
    client.outlines[("kb:1", None)] = OutlineResult(ref="kb:1", nodes=[OutlineNode(ref="mooc:2", entityType="mooc",
                                                                                   title="课")], total=1)
    client.outlines[("mooc:2", None)] = OutlineResult(ref="mooc:2", nodes=[
        OutlineNode(ref="mooc_item:5", entityType="mooc_item", title="第一章")])
    registry, _store = make_toolkit(client, FakeIndexReader())

    result = await _call(registry, make_tool_run(), "kb_outline", {"ref": "kb:1", "depth": 2})

    node = _payload(result)["nodes"][0]
    assert node["ref"] == "mooc:2"
    assert node["children"][0]["ref"] == "mooc_item:5"
    assert node["evidenceId"] == "E1"
    assert node["children"][0]["evidenceId"] == "E2"
    mooc, item = result.evidence
    assert (mooc.source_id, mooc.title, mooc.kb_id, mooc.structured) == ("mooc:2", "课", 1, True)
    assert (item.source_type, item.source_id, item.title) == ("mooc_item", "mooc_item:5", "第一章")
    assert item.locator == {"row": True, "moocId": 2}


async def test_outline_default_page_is_observed_whole():
    """复现：知识库目录默认一页 50 个节点约 8000 字，观察里应原样保留，不被截成前 500 字。"""
    client = FakeKnowledgeClient()
    client.allow("kb:1", kb_id=1)
    client.outlines[("kb:1", None)] = OutlineResult(ref="kb:1", nodes=[
        OutlineNode(ref=f"note:{100 + index}", entityType="note", parentRef="kb:1",
                    title=f"第{index}章 进程调度与内存管理读书笔记整理", updateTime="2026-11-12T08:00:00")
        for index in range(50)
    ], total=50)
    registry, _store = make_toolkit(client, FakeIndexReader())
    run = make_tool_run()
    plane = ActionPlane(registry)

    result = await plane.execute(run, ToolCall(call_id="c1", name="kb_outline", arguments={"ref": "kb:1"}))
    observation = plane.observe(run, result)

    assert len(result.content) > run.runtime.large_result_chars
    assert observation.content == result.content
    assert observation.result_ref is None
    assert len(_payload(result)["nodes"]) == 50


async def test_outline_note_headings_are_citable_by_line_range():
    """笔记标题树的每个小节登记为指向该笔记行范围的结构化证据。"""
    client = FakeKnowledgeClient()
    client.allow("note:7", kb_id=3)
    client.outlines[("note:7", None)] = OutlineResult(ref="note:7", nodes=[
        OutlineNode(ref="note:7", entityType="heading", title="第一章", parentRef="note:7",
                    locator={"startLine": 1, "endLine": 4}),
        OutlineNode(ref="note:7", entityType="heading", title="第二章", parentRef="note:7",
                    locator={"startLine": 5, "endLine": 9}),
    ])
    registry, _store = make_toolkit(client, FakeIndexReader())

    result = await _call(registry, make_tool_run(), "kb_outline", {"ref": "note:7"})

    assert [node["evidenceId"] for node in _payload(result)["nodes"]] == ["E1", "E2"]
    heading = result.evidence[1]
    assert (heading.source_type, heading.source_id, heading.title, heading.kb_id) == ("note", "note:7", "第二章", 3)
    assert heading.locator == {"row": True, "startLine": 5, "endLine": 9}


async def test_outline_doc_groups_by_heading_or_page():
    """资料目录按连续标题分组，无标题时按页分组；每组可按页码引用。"""
    client = FakeKnowledgeClient()
    client.allow("doc:4")
    index = FakeIndexReader()
    index.chunks = {"doc:4": [
        chunk("doc:4", 0, "a", "doc", page=1, section="第一章"),
        chunk("doc:4", 1, "b", "doc", page=2, section="第一章"),
        chunk("doc:4", 2, "c", "doc", page=3),
    ]}
    registry, _store = make_toolkit(client, index)
    result = await _call(registry, make_tool_run(), "kb_outline", {"ref": "doc:4"})
    assert _payload(result)["nodes"] == [
        {"sectionPath": "第一章", "pageStart": 1, "pageEnd": 2, "evidenceId": "E1"},
        {"sectionPath": None, "pageStart": 3, "pageEnd": 3, "evidenceId": "E2"},
    ]
    first = result.evidence[0]
    assert (first.source_id, first.title, first.structured) == ("doc:4", "标题-doc:4", True)
    assert first.locator == {"row": True, "sectionPath": "第一章", "pageStart": 1, "pageEnd": 2}


async def test_outline_children_outside_explicit_refs_are_not_citable():
    """只限定一门慕课时，章节可以列出，但不在范围内的条目不登记为证据。"""
    scope = KnowledgeScope(userId=7, defaultScope=False, knowledgeBases=[ScopeKnowledgeBase(kbId=1)])
    client = FakeKnowledgeClient(scope)
    client.allow("mooc:2", kb_id=1)
    client.outlines[("mooc:2", None)] = OutlineResult(ref="mooc:2", nodes=[
        OutlineNode(ref="mooc_item:5", entityType="mooc_item", title="第一章")])
    registry, _store = make_toolkit(client, FakeIndexReader())

    result = await _call(registry, make_tool_run(scope=RunScope(refs=["mooc:2"])), "kb_outline", {"ref": "mooc:2"})

    assert "evidenceId" not in _payload(result)["nodes"][0]
    assert result.evidence == []


async def test_outline_admin_default_filters_entity_nodes():
    """超管默认范围下目录里的实体节点按普通成员口径过滤。"""
    client = FakeKnowledgeClient(KnowledgeScope(userId=12, admin=True, defaultScope=True, knowledgeBases=[
        ScopeKnowledgeBase(kbId=1, role="READ")]))
    client.allow("kb:1")
    client.outlines[("kb:1", None)] = OutlineResult(ref="kb:1", nodes=[
        OutlineNode(ref="note:1", entityType="note", title="公开"),
        OutlineNode(ref="note:2", entityType="note", title="他人私有")])
    index = FakeIndexReader()
    index.passing = {"kb:1", "note:1"}
    registry, _store = make_toolkit(client, index)
    result = await _call(registry, make_tool_run(), "kb_outline", {"ref": "kb:1"})
    assert [node["ref"] for node in _payload(result)["nodes"]] == ["note:1"]


async def test_related_attachments_submission_links_and_siblings():
    """关系遍历覆盖附属内容、我的提交、正文链接与同库实体，结果均经可读性确认。"""
    client = FakeKnowledgeClient()
    for ref in ("mooc_item:5", "task:4", "note:1", "note:8", "kb:1"):
        client.allow(ref)
    client.allow("mooc_item:5", "transcript")
    registry, _store = make_toolkit(client, FakeIndexReader())
    run = make_tool_run()

    attachments = await _call(registry, run, "kb_related", {"ref": "mooc_item:5", "relation": "attachments"})
    assert _payload(attachments)["related"] == [
        {"ref": "mooc_item:5", "subtype": "transcript", "kbId": 1, "evidenceId": "E1"}]
    transcript = attachments.evidence[0]
    assert (transcript.source_type, transcript.source_id, transcript.authority) == (
        "transcript", "mooc_item:5#transcript", "transcript")
    assert transcript.structured is True

    client.query_result = QueryResult(rows=[QueryRow(ref="task:4", kbId=1, attributes={
        "submissionNoteId": 8, "noteHistoryId": 30, "submissionStatus": 1})])
    submission = await _call(registry, run, "kb_related", {"ref": "task:4", "relation": "submission"})
    assert _payload(submission)["related"][0]["ref"] == "note:8"
    assert _payload(submission)["related"][0]["noteHistoryId"] == 30
    assert _payload(submission)["related"][0]["evidenceId"] == "E2"

    client.contents["note:1"] = [ContentResult(ref="note:1", content="见 [x](/notes/1/8) 和 [y](/notes/1/77)")]
    links = await _call(registry, run, "kb_related", {"ref": "note:1", "relation": "links"})
    assert _payload(links)["related"] == [{"ref": "note:8", "kbId": 1, "evidenceId": "E2"}]

    client.outlines[("kb:1", None)] = OutlineResult(ref="kb:1", nodes=[
        OutlineNode(ref="note:1", entityType="note"), OutlineNode(ref="note:8", entityType="note", title="笔记八")])
    siblings = await _call(registry, run, "kb_related", {"ref": "note:1", "relation": "siblings"})
    assert [item["ref"] for item in _payload(siblings)["related"]] == ["note:8"]
    assert _payload(siblings)["related"][0]["evidenceId"] == "E2"
    assert siblings.evidence[0].kb_id == 1


async def test_related_mooc_item_siblings_use_index_parent_and_reject_mismatch():
    """条目的同级通过索引里的上级引用查找；关系与实体不匹配时参数错误。"""
    client = FakeKnowledgeClient()
    client.allow("mooc_item:5")
    client.query_result = QueryResult(rows=[QueryRow(ref="mooc_item:5", kbId=1), QueryRow(ref="mooc_item:6", kbId=1)])
    index = FakeIndexReader()
    index.parents = {"mooc_item:5": "mooc_item:3"}
    registry, _store = make_toolkit(client, index)

    result = await _call(registry, make_tool_run(), "kb_related", {"ref": "mooc_item:5", "relation": "siblings"})
    assert [item["ref"] for item in _payload(result)["related"]] == ["mooc_item:6"]
    assert client.calls[-1][1]["filters"] == {"parentId": 3}

    mismatch = await _call(registry, make_tool_run(run_id="r2"), "kb_related",
                           {"ref": "mooc_item:5", "relation": "contains"})
    assert mismatch.error_category == ActionErrorCategory.INVALID_ARGUMENTS


async def test_scope_is_fetched_once_per_run_and_released_after_run():
    """同一运行多次调用工具只取一次检索范围，运行结束后会话被释放。"""
    client = FakeKnowledgeClient()
    registry, store = make_toolkit(client, FakeIndexReader())
    run = make_tool_run()
    await _call(registry, run, "kb_list", {})
    await _call(registry, run, "kb_search", {"query": "索引"}, call_id="c2")
    assert client.count("scope") == 1
    assert run.run_id in store

    from harness.middleware import Hook, MiddlewareContext

    await RetrievalSessionMiddleware(store).handle(MiddlewareContext(run=run, hook=Hook.AFTER_RUN))
    assert run.run_id not in store
