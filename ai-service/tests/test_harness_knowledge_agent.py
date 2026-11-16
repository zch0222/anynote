"""知识检索 Agent 的 Harness 运行集成单元测试。

@author 称霸幼儿园
"""

import json

from core.config import HarnessRuntimeSettings
from harness.context.builder import ContextBuilder
from harness.context.policy import EVIDENCE_BEGIN, EVIDENCE_END
from harness.events import EventBus
from harness.loop import Harness
from harness.models import EvidenceItem, RunContext, RunOutcome, RunRequest, RunScope
from models.catalog import ModelCatalogSnapshot
from models.scripted import ScriptedModel, ScriptStep
from retrieval.search import SearchOutcome
from retrieval.session import RetrievalSessionMiddleware, RetrievalSessionStore
from tests.conftest import CharacterCounter
from retrieval.models import (
    KnowledgeScope,
    QueryResult,
    QueryRow,
    ScopeKnowledgeBase,
    StatsKnowledgeBase,
    StatsResult,
)
from harness.action.registry import ToolRegistry
from tests.knowledge_fakes import FakeIndexReader, FakeKnowledgeClient
from tools.knowledge import KNOWLEDGE_TOOL_NAMES, register_knowledge_tools
from tools.knowledge.common import KnowledgeToolContext
from agents.knowledge_retrieval.agent import load_knowledge_retrieval_agent
from harness.models import ModelChunk, RunState, ToolCall
from harness.verify.framework import VerificationIssue


class PrefetchSearcher:
    """记录原始首轮查询并返回预设证据。

    @author 称霸幼儿园
    """

    def __init__(self, evidence: list[EvidenceItem]):
        self.evidence = evidence
        self.requests = []

    async def search(self, _session, request):
        self.requests.append(request)
        return SearchOutcome(self.evidence, [], [], {})


def _run(run_id: str = "knowledge-run") -> RunContext:
    """构造知识检索 Agent 运行上下文。"""
    return RunContext(
        request=RunRequest(
            runId=run_id,
            input="原始用户问题",
            agent="knowledge-retrieval",
        ),
        agent=load_knowledge_retrieval_agent(),
        runtime=HarnessRuntimeSettings(),
        model_snapshot=ModelCatalogSnapshot(version="0:0"),
        access_token="user-token",
    )


def _tool_arguments(
    outcome: str,
    index: int = 1,
    quote: str = "可核对原文",
    answer: str = "结论[1]",
) -> dict:
    """构造 Agent 结构化终态工具参数；回答正文放在 answer 里。"""
    if outcome != "ANSWERED":
        return {"outcome": outcome, "citations": []}
    return {
        "outcome": outcome,
        "answer": answer,
        "citations": [{"index": index, "quote": quote}],
    }


def _finish(call_id: str, arguments: dict) -> ModelChunk:
    """构造一次 agent_finish 工具调用。"""
    return ModelChunk(tool_calls=[ToolCall(call_id=call_id, name="agent_finish", arguments=arguments)])


def _deltas(events) -> list[str]:
    """取出发给调用方的回答文本。"""
    return [event.data["delta"] for event in events if event.type == "text.delta"]


async def _execute(
    model: ScriptedModel,
    evidence: list[EvidenceItem],
    knowledge: FakeKnowledgeClient | None = None,
    runtime: HarnessRuntimeSettings | None = None,
    force_finish: bool = False,
):
    """挂载知识工具与首轮中间件并收集运行事件。"""
    knowledge = knowledge or FakeKnowledgeClient()
    index = FakeIndexReader()
    store = RetrievalSessionStore(knowledge, index)  # type: ignore[arg-type]
    searcher = PrefetchSearcher(evidence)
    registry = ToolRegistry()
    register_knowledge_tools(registry, KnowledgeToolContext(store=store, searcher=searcher))
    harness = Harness(
        model,
        registry=registry,
        middlewares=[RetrievalSessionMiddleware(store, registry.get("kb_search"))],
        context_builder=ContextBuilder(model, CharacterCounter()),
    )
    run = _run()
    run.runtime = runtime or HarnessRuntimeSettings(prefetch_enabled=True)
    run.force_finish = force_finish
    bus = EventBus(run.run_id)
    await harness.run(run, bus)
    await bus.close()
    return run, searcher, model.calls, [event async for event in bus.events()]


def _evidence() -> EvidenceItem:
    """构造知识检索的权限确认后证据。"""
    return EvidenceItem(
        evidenceId="E1",
        sourceType="note",
        sourceId="note:7",
        content="这是可核对原文。",
        title="课程笔记",
        locator={"startLine": 3},
        kbId=2,
        kbName="课程库",
        permissionBasis="MEMBER",
    )


async def test_first_turn_prefetch_is_hidden_until_citation_validation_finishes():
    """首轮预取使用原问题；回答取自 agent_finish.answer，助手正文里的过程话术不会发出。"""
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(text_delta="我来为你查询相关内容。"),
                    _finish("finish-1", _tool_arguments("ANSWERED")),
                ]
            )
        ]
    )

    run, searcher, calls, events = await _execute(model, [_evidence()])
    visible = [event for event in events if not event.type.startswith("trace.")]

    assert len(searcher.requests) == 1
    assert searcher.requests[0].query == "原始用户问题"
    registered = {item["function"]["name"] for item in calls[0]["tools"]}
    assert registered == {*KNOWLEDGE_TOOL_NAMES, "agent_finish"}
    assert any("这是可核对原文" in item["content"] for item in calls[0]["messages"])
    assert run.state == RunState.COMPLETED
    assert run.outcome == RunOutcome.ANSWERED
    assert _deltas(visible) == ["结论[1]"]
    citation = next(event for event in visible if event.type == "citation")
    assert citation.data["evidenceId"] == "E1"
    assert citation.data["snippet"] is None
    assert "agent_finish" not in "".join(_deltas(visible))
    assert next(event for event in visible if event.type == "run.started").data["scopeSummary"] == "默认范围"


async def test_invalid_first_citation_retries_before_any_answer_text_is_emitted():
    """无效引用使模型重试一次，首轮草稿不会进入 SSE。"""
    model = ScriptedModel(
        [
            ScriptStep([_finish("finish-bad", _tool_arguments("ANSWERED", index=2, answer="错误草稿[2]"))]),
            ScriptStep([_finish("finish-good", _tool_arguments("ANSWERED", answer="正确回答[1]"))]),
        ]
    )

    _run_context, _searcher, calls, events = await _execute(model, [_evidence()])

    assert len(calls) == 2
    assert _deltas(events) == ["正确回答[1]"]


async def test_kb_list_answer_cites_knowledge_bases_instead_of_not_found():
    """复现：问「我有哪些知识库」时模型调用 kb_list 作答，回答不能被改写成未找到。"""
    knowledge = FakeKnowledgeClient()
    knowledge.stats_result = StatsResult(
        knowledgeBases=[
            StatsKnowledgeBase(
                kbId=1,
                name="库一",
                role="EDIT",
                counts={"note": 3, "doc": 1, "mooc": 0, "task": 2},
            )
        ]
    )
    model = ScriptedModel(
        [
            ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="list-1", name="kb_list", arguments={})])]),
            ScriptStep(
                [
                    _finish(
                        "finish-list",
                        _tool_arguments(
                            "ANSWERED",
                            quote='{"kbId":1,"name":"库一","role":"EDIT"}',
                            answer="你有 1 个知识库：库一[1]",
                        ),
                    )
                ]
            ),
        ]
    )

    run, _searcher, calls, events = await _execute(model, [], knowledge)
    citation = next(event for event in events if event.type == "citation")
    tool_message = next(item for item in calls[1]["messages"] if item["role"] == "tool")

    assert run.outcome == RunOutcome.ANSWERED
    assert _deltas(events) == ["你有 1 个知识库：库一[1]"]
    assert '"evidenceId":"E1"' in tool_message["content"]
    assert citation.data["sourceType"] == "kb"
    assert citation.data["sourceId"] == "kb:1"
    assert citation.data["kbId"] == 1
    assert citation.data["title"] == "库一"
    assert citation.data["snippet"] == "笔记 3 · 资料 1 · 慕课 0 · 任务 2"


async def test_kb_query_row_cited_with_paraphrased_quote_is_accepted():
    """复现：清单行被改写引用时不再判为无效引用。"""
    knowledge = FakeKnowledgeClient()
    knowledge.query_result = QueryResult(
        rows=[QueryRow(ref="note:101", entityType="note", kbId=1, title="倒排索引笔记")],
        count=1,
    )
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(
                        tool_calls=[
                            ToolCall(
                                call_id="query-1",
                                name="kb_query",
                                arguments={"entity": "note", "sort": "updatedAt:desc"},
                            )
                        ]
                    )
                ]
            ),
            ScriptStep(
                [
                    _finish(
                        "finish-query",
                        _tool_arguments(
                            "ANSWERED",
                            quote="倒排索引笔记（note:101），更新时间 2026-11-14",
                            answer="最近更新的是倒排索引笔记[1]",
                        ),
                    )
                ]
            ),
        ]
    )

    run, _searcher, calls, events = await _execute(model, [], knowledge)
    citation = next(event for event in events if event.type == "citation")

    assert len(calls) == 2
    assert run.outcome == RunOutcome.ANSWERED
    assert _deltas(events) == ["最近更新的是倒排索引笔记[1]"]
    assert citation.data["sourceId"] == "note:101"
    assert citation.data["title"] == "倒排索引笔记"
    assert citation.data["snippet"] is None


async def test_structured_rows_stay_out_of_the_evidence_layer():
    """清单行只出现在工具结果里，不再以证据层重复发给模型。"""
    knowledge = FakeKnowledgeClient()
    knowledge.query_result = QueryResult(rows=[QueryRow(ref="note:101", entityType="note", kbId=1, title="唯一标题")])
    model = ScriptedModel(
        [
            ScriptStep(
                [ModelChunk(tool_calls=[ToolCall(call_id="q", name="kb_query", arguments={"entity": "note"})])]
            ),
            ScriptStep([_finish("finish", _tool_arguments("ANSWERED", answer="唯一标题[1]", quote=""))]),
        ]
    )

    _run, _searcher, calls, _events = await _execute(model, [], knowledge)
    non_tool = [item["content"] for item in calls[1]["messages"] if item["role"] != "tool"]

    assert not any("唯一标题" in str(content) for content in non_tool)


def _query_rows(count: int) -> list[QueryRow]:
    """构造标题长度接近真实笔记的清单行。"""
    return [
        QueryRow(
            ref=f"note:{100 + index}",
            entityType="note",
            kbId=1,
            title=f"第{index}章 进程调度与内存管理读书笔记整理",
            updateTime="2026-11-12T08:00:00",
        )
        for index in range(count)
    ]


def _query_model(call_id: str, arguments: dict) -> ScriptedModel:
    """先调用一次 kb_query，再以结构化行作答。"""
    return ScriptedModel(
        [
            ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id=call_id, name="kb_query", arguments=arguments)])]),
            ScriptStep([_finish("finish", _tool_arguments("ANSWERED", answer="共有这些笔记[1]", quote=""))]),
        ]
    )


def _tool_result(call: dict, call_id: str) -> str:
    """取出模型第二轮看到的工具结果正文（去掉不可信定界符）。"""
    message = next(item for item in call["messages"] if item.get("tool_call_id") == call_id)
    content = message["content"]
    assert content.startswith(f"{EVIDENCE_BEGIN}\n") and content.endswith(f"\n{EVIDENCE_END}")
    return content[len(EVIDENCE_BEGIN) + 1 : -len(EVIDENCE_END) - 1]


async def test_kb_query_default_page_reaches_model_in_full():
    """复现：默认一页 20 行超过 2000 字时模型只看到前 500 字，后面的行和 count 都看不到。"""
    knowledge = FakeKnowledgeClient()
    knowledge.query_result = QueryResult(rows=_query_rows(20), count=20)
    model = _query_model("query-page", {"entity": "note", "with_count": True})

    run, _searcher, calls, _events = await _execute(model, [], knowledge)
    seen = _tool_result(calls[1], "query-page")
    payload = json.loads(seen)

    assert len(seen) > 2000
    assert payload["count"] == 20
    assert [row["ref"] for row in payload["rows"]] == [f"note:{100 + index}" for index in range(20)]
    assert "omitted" not in payload
    assert run.outcome == RunOutcome.ANSWERED


async def test_kb_query_over_budget_keeps_count_and_whole_rows():
    """复现：超出展示上限的清单仍是合法 JSON，保留 count、只保留完整的行并说明省略了多少。"""
    knowledge = FakeKnowledgeClient()
    knowledge.query_result = QueryResult(rows=_query_rows(100), count=100)
    model = _query_model("query-all", {"entity": "note", "limit": 100, "with_count": True})

    _run, _searcher, calls, _events = await _execute(model, [], knowledge)
    seen = _tool_result(calls[1], "query-all").split("\n完整结果引用: ")[0]
    payload = json.loads(seen)
    shown = payload["rows"]

    assert payload["count"] == 100
    assert 20 <= len(shown) < 100
    assert [row["ref"] for row in shown] == [f"note:{100 + index}" for index in range(len(shown))]
    assert all(row["title"].endswith("读书笔记整理") and row["evidenceId"] for row in shown)
    assert payload["omitted"] == {"rows": 100 - len(shown)}
    assert payload["omittedHint"]


async def test_invalid_finish_arguments_are_retried_instead_of_failing_the_run():
    """agent_finish 参数不合法时提示模型重交一次，而不是直接以内部错误结束。"""
    model = ScriptedModel(
        [
            ScriptStep([_finish("finish-bad", {**_tool_arguments("ANSWERED"), "reasoning": "多余字段"})]),
            ScriptStep([_finish("finish-good", _tool_arguments("ANSWERED"))]),
        ]
    )

    run, _searcher, calls, events = await _execute(model, [_evidence()])

    assert len(calls) == 2
    assert run.outcome == RunOutcome.ANSWERED
    assert _deltas(events) == ["结论[1]"]
    assert any("agent_finish" in hint for hint in run.last_hints)


async def test_answer_falls_back_to_same_reply_text_when_finish_has_no_answer():
    """agent_finish 没带 answer 时，以同一条回复的正文为回答（真实模型的常见写法）。"""
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(text_delta="倒排索引是从词到文档的映射[1]。"),
                    _finish("finish", {"outcome": "ANSWERED", "citations": [{"index": 1, "quote": "可核对原文"}]}),
                ]
            )
        ]
    )

    run, _searcher, calls, events = await _execute(model, [_evidence()])

    assert len(calls) == 1
    assert run.outcome == RunOutcome.ANSWERED
    assert _deltas(events) == ["倒排索引是从词到文档的映射[1]。"]


async def test_plain_text_finish_keeps_tools_available_and_does_not_force_finish():
    """纯文本完成申请不再触发缺终态重交，也不打开强制收束。"""
    model = ScriptedModel(
        [ScriptStep([ModelChunk(text_delta="倒排索引是从词到文档的映射[1]。")])]
    )

    run, _searcher, calls, events = await _execute(model, [_evidence()])

    assert len(calls) == 1
    assert {item["function"]["name"] for item in calls[0]["tools"]} == {
        *KNOWLEDGE_TOOL_NAMES,
        "agent_finish",
    }
    assert run.force_finish is False
    assert run.outcome == RunOutcome.ANSWERED
    assert _deltas(events) == ["倒排索引是从词到文档的映射[1]。"]


async def test_finish_combined_with_tool_call_runs_the_tool_first():
    """agent_finish 与其他工具同轮出现时先执行工具，终态在看到结果后再提交。"""
    knowledge = FakeKnowledgeClient()
    knowledge.stats_result = StatsResult(knowledgeBases=[StatsKnowledgeBase(kbId=1, name="库一", counts={"note": 3})])
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(
                        tool_calls=[
                            ToolCall(call_id="list-1", name="kb_list", arguments={}),
                            ToolCall(
                                call_id="finish-early",
                                name="agent_finish",
                                arguments=_tool_arguments("ANSWERED", answer="猜测的回答[1]"),
                            ),
                        ]
                    )
                ]
            ),
            ScriptStep([_finish("finish-late", _tool_arguments("ANSWERED", answer="你有库一[1]", quote=""))]),
        ]
    )

    run, _searcher, calls, events = await _execute(model, [], knowledge)

    assert len(calls) == 2
    assert knowledge.count("stats") == 1
    assert run.outcome == RunOutcome.ANSWERED
    assert _deltas(events) == ["你有库一[1]"]


async def test_not_found_signal_replaces_model_text_with_fixed_result():
    """未找到终态使用固定文案，模型草稿不会发给调用方。"""
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(text_delta="不应展示的草稿"),
                    ModelChunk(
                        tool_calls=[
                            ToolCall(
                                call_id="finish-none",
                                name="agent_finish",
                                arguments={"outcome": "NOT_FOUND"},
                            )
                        ]
                    ),
                ]
            )
        ]
    )

    run, _searcher, _calls, events = await _execute(model, [])
    deltas = [event.data["delta"] for event in events if event.type == "text.delta"]

    assert run.outcome == RunOutcome.NOT_FOUND
    assert deltas == ["未找到相关内容。已查询范围：默认范围"]


async def test_clarification_signal_emits_one_agent_question_as_terminal_result():
    """结构化澄清终态只向调用方输出一个 Agent 问题。"""
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(text_delta="内部草稿不应展示"),
                    ModelChunk(
                        tool_calls=[
                            ToolCall(
                                call_id="finish-clarification",
                                name="agent_finish",
                                arguments={
                                    "outcome": "NEEDS_CLARIFICATION",
                                    "clarification_question": "你指哪门课程？",
                                },
                            )
                        ]
                    ),
                ]
            )
        ]
    )

    run, _searcher, _calls, events = await _execute(model, [])
    deltas = [event.data["delta"] for event in events if event.type == "text.delta"]

    assert run.outcome == RunOutcome.NEEDS_CLARIFICATION
    assert deltas == ["你指哪门课程？"]


def test_scope_summary_uses_permission_confirmed_names_and_requested_refs():
    """显式范围摘要只使用权限确认后的知识库名称和请求实体标识。"""
    summary = RetrievalSessionMiddleware._scope_summary(
        RunScope(knowledgeBaseIds=[4], refs=["doc:8"]),
        KnowledgeScope(
            userId=7,
            defaultScope=False,
            knowledgeBases=[ScopeKnowledgeBase(kbId=4, name="课程库")],
        ),
    )

    assert summary == "课程库、doc:8"


async def test_kb_list_plain_text_without_citation_is_repaired_once_then_delivered():
    """复现清单回答无编号：保留工具能力修复一次，仍缺失时标注并交付。"""
    knowledge = FakeKnowledgeClient()
    knowledge.stats_result = StatsResult(
        knowledgeBases=[StatsKnowledgeBase(kbId=1, name="库一", counts={"note": 3})]
    )
    model = ScriptedModel(
        [
            ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="list-1", name="kb_list", arguments={})])]),
            ScriptStep([ModelChunk(text_delta="你有 1 个知识库：库一")]),
            ScriptStep([ModelChunk(text_delta="你有 1 个知识库：库一")]),
        ]
    )

    run, _searcher, calls, events = await _execute(model, [], knowledge)
    finished = next(event for event in events if event.type == "run.finished")

    assert run.outcome == RunOutcome.ANSWERED
    assert run.state == RunState.COMPLETED
    assert len(calls) == 3
    assert run.force_finish is False
    assert "kb_list" in {item["function"]["name"] for item in calls[2]["tools"]}
    assert "上一次回答没有通过校验" in calls[2]["messages"][0]["content"]
    assert _deltas(events) == ["你有 1 个知识库：库一"]
    assert finished.data["answerNotices"] == ["UNSOURCED"]


async def test_plain_text_answer_is_a_completion_request_without_finish_tool():
    """有正文且没有工具调用时直接申请完成，不再要求 agent_finish。"""
    model = ScriptedModel([ScriptStep([ModelChunk(text_delta="结论[1]")])])

    run, _searcher, calls, events = await _execute(model, [_evidence()])
    finished = next(event for event in events if event.type == "run.finished")

    assert len(calls) == 1
    assert run.outcome == RunOutcome.ANSWERED
    assert _deltas(events) == ["结论[1]"]
    assert finished.data["answerNotices"] == []


async def test_prefetch_defaults_off_for_conversation_and_can_be_enabled_with_candidate_label():
    """默认问候不预取且标注非知识库；开启时预取证据标为原句候选。"""
    greeting = ScriptedModel([ScriptStep([ModelChunk(text_delta="你好，很高兴帮助你。")])])
    run, searcher, _calls, events = await _execute(
        greeting,
        [_evidence()],
        runtime=HarnessRuntimeSettings(),
    )
    greeting_finished = next(event for event in events if event.type == "run.finished")

    assert searcher.requests == []
    assert run.outcome == RunOutcome.ANSWERED
    assert greeting_finished.data["answerNotices"] == ["NOT_FROM_KNOWLEDGE"]

    prefetched = ScriptedModel([ScriptStep([ModelChunk(text_delta="结论[1]")])])
    _run, enabled_searcher, _calls, enabled_events = await _execute(
        prefetched,
        [_evidence()],
        runtime=HarnessRuntimeSettings(prefetch_enabled=True),
    )
    context_trace = next(event for event in enabled_events if event.type == "trace.context")
    evidence_entry = next(
        item
        for item in context_trace.data["attributes"]["manifest"]["entries"]
        if item["sourceType"] == "note"
    )
    assert enabled_searcher.requests[0].query == "原始用户问题"
    assert evidence_entry["selectedReason"] == "按原句预先检索的候选"


async def test_repair_hint_is_only_present_in_the_next_model_turn():
    """结构化修复提示只注入下一轮，后续工具轮不重复携带。"""
    knowledge = FakeKnowledgeClient()
    knowledge.stats_result = StatsResult(
        knowledgeBases=[StatsKnowledgeBase(kbId=2, name="库二", counts={"note": 1})]
    )
    model = ScriptedModel(
        [
            ScriptStep([ModelChunk(text_delta="没有来源的回答")]),
            ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="list-2", name="kb_list", arguments={})])]),
            ScriptStep([ModelChunk(text_delta="结论[1]")]),
        ]
    )

    run, _searcher, calls, _events = await _execute(model, [_evidence()], knowledge)

    assert run.outcome == RunOutcome.ANSWERED
    assert "上一次回答没有通过校验" in calls[1]["messages"][0]["content"]
    assert "上一次回答没有通过校验" not in calls[2]["messages"][0]["content"]


async def test_force_finish_ignores_tool_calls_when_same_reply_has_answer_text():
    """收束轮忽略其他工具，但同条回复正文仍按完成申请校验。"""
    knowledge = FakeKnowledgeClient()
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(text_delta="收束回答[1]"),
                    ModelChunk(
                        tool_calls=[ToolCall(call_id="ignored-list", name="kb_list", arguments={})]
                    ),
                ]
            )
        ]
    )

    run, _searcher, _calls, events = await _execute(
        model,
        [_evidence()],
        knowledge,
        force_finish=True,
    )

    assert knowledge.count("stats") == 0
    assert run.outcome == RunOutcome.ANSWERED
    assert _deltas(events) == ["收束回答[1]"]


async def test_two_empty_model_outputs_fail_with_empty_output_category():
    """连续两轮无正文也无工具时以 EMPTY_MODEL_OUTPUT 失败，重交轮不强制收束。"""
    model = ScriptedModel([ScriptStep(), ScriptStep()])

    run, _searcher, calls, events = await _execute(
        model,
        [],
        runtime=HarnessRuntimeSettings(),
    )
    error = next(event for event in events if event.type == "error")

    assert len(calls) == 2
    assert run.force_finish is False
    assert "kb_list" in {item["function"]["name"] for item in calls[1]["tools"]}
    assert run.outcome == RunOutcome.FAILED
    assert error.data["category"] == "EMPTY_MODEL_OUTPUT"
    assert events[-1].data["answerNotices"] == []


async def test_second_invalid_finish_signal_fails_as_internal():
    """连续两次非法 agent_finish 参数按已确认的 INTERNAL 类别结束。"""
    model = ScriptedModel(
        [
            ScriptStep([_finish("bad-1", {"outcome": "ANSWERED", "reasoning": "多余字段"})]),
            ScriptStep([_finish("bad-2", {"outcome": "ANSWERED", "reasoning": "多余字段"})]),
        ]
    )

    run, _searcher, _calls, events = await _execute(model, [_evidence()])
    error = next(event for event in events if event.type == "error")

    assert run.outcome == RunOutcome.FAILED
    assert error.data["category"] == "INTERNAL"


async def test_mismatched_quote_is_removed_after_one_repair_and_traced():
    """对不上的原文修复一次后移除编号，交付正文并记录结构化 Trace。"""
    model = ScriptedModel(
        [
            ScriptStep([_finish("quote-bad-1", _tool_arguments("ANSWERED", quote="对不上的原文"))]),
            ScriptStep([_finish("quote-bad-2", _tool_arguments("ANSWERED", quote="对不上的原文"))]),
        ]
    )

    run, _searcher, calls, events = await _execute(model, [_evidence()])
    verify_traces = [event for event in events if event.type == "trace.verify"]
    finished = next(event for event in events if event.type == "run.finished")

    assert run.outcome == RunOutcome.ANSWERED
    assert len(calls) == 2
    assert "[1] 附的原文没有出现在证据 E1 里" in calls[1]["messages"][0]["content"]
    assert _deltas(events) == ["结论"]
    assert finished.data["answerNotices"] == ["UNSOURCED", "CITATIONS_REMOVED"]
    invalid = verify_traces[-1].data["attributes"]["issues"][0]
    assert invalid["code"] == "INVALID_CITATION"
    assert invalid["indices"] == [1]
    assert invalid["repairable"] is True


async def test_force_finish_with_only_tool_calls_fails_and_keeps_last_hint():
    """收束轮只有工具且没有正文时以 NO_PROGRESS 失败，完成事件保留持续提示。"""
    model = ScriptedModel(
        [ScriptStep([ModelChunk(tool_calls=[ToolCall(call_id="only-tool", name="kb_list", arguments={})])])]
    )

    run, _searcher, _calls, events = await _execute(model, [], force_finish=True)
    error = next(event for event in events if event.type == "error")
    finished = next(event for event in events if event.type == "run.finished")

    assert run.outcome == RunOutcome.FAILED
    assert error.data["category"] == "NO_PROGRESS"
    assert finished.data["unfinished"] == ["连续行动没有新增进展，停止检索并直接给出结果。"]


def test_repair_hint_limits_available_evidence_to_ten_and_reports_total():
    """修复提示最多列十条证据，并注明实际证据总数。"""
    evidence = [
        EvidenceItem(
            evidenceId=f"E{index}",
            sourceType="note",
            sourceId=f"note:{index}",
            content="正文",
            title=f"笔记 {index}",
        )
        for index in range(1, 12)
    ]

    hint = Harness._repair_hint(
        [VerificationIssue(code="MISSING_CITATION", detail="缺少来源")],
        evidence,
    )

    assert "[10] note「笔记 10」" in hint
    assert "[11]" not in hint
    assert "共 11 条证据，仅列前 10 条" in hint
