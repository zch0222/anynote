"""知识检索 Agent 的 Harness 运行集成单元测试。

@author 称霸幼儿园
"""

from core.config import HarnessRuntimeSettings
from harness.context.builder import ContextBuilder
from harness.events import EventBus
from harness.loop import Harness
from harness.models import EvidenceItem, RunContext, RunOutcome, RunRequest, RunScope
from models.catalog import ModelCatalogSnapshot
from models.scripted import ScriptedModel, ScriptStep
from retrieval.search import SearchOutcome
from retrieval.session import RetrievalSessionMiddleware, RetrievalSessionStore
from tests.conftest import CharacterCounter
from retrieval.models import KnowledgeScope, ScopeKnowledgeBase
from harness.action.registry import ToolRegistry
from tests.knowledge_fakes import FakeIndexReader, FakeKnowledgeClient
from tools.knowledge import KNOWLEDGE_TOOL_NAMES, register_knowledge_tools
from tools.knowledge.common import KnowledgeToolContext
from agents.knowledge_retrieval.agent import load_knowledge_retrieval_agent
from harness.models import ModelChunk, RunState, ToolCall


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


def _tool_arguments(outcome: str, index: int = 1, quote: str = "可核对原文") -> dict:
    """构造 Agent 结构化终态工具参数。"""
    return {
        "outcome": outcome,
        "citations": [{"index": index, "quote": quote}] if outcome == "ANSWERED" else [],
    }


async def _execute(model: ScriptedModel, evidence: list[EvidenceItem]):
    """挂载知识工具与首轮中间件并收集运行事件。"""
    knowledge = FakeKnowledgeClient()
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
    """首轮预取使用原问题，Agent 终态信号不进入 SSE 文本。"""
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(text_delta="结论[1]"),
                    ModelChunk(
                        tool_calls=[
                            ToolCall(
                                call_id="finish-1",
                                name="agent_finish",
                                arguments=_tool_arguments("ANSWERED"),
                            )
                        ]
                    ),
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
    assert [event.type for event in visible].count("text.delta") == 1
    assert next(event for event in visible if event.type == "text.delta").data["delta"] == "结论[1]"
    citation = next(event for event in visible if event.type == "citation")
    assert citation.data["evidenceId"] == "E1"
    assert citation.data["snippet"] == "可核对原文"
    assert "agent_finish" not in "".join(str(event.data) for event in visible if event.type == "text.delta")
    assert next(event for event in visible if event.type == "run.started").data["scopeSummary"] == "默认范围"


async def test_invalid_first_citation_retries_before_any_answer_text_is_emitted():
    """无效引用使模型重试一次，首轮草稿不会进入 SSE。"""
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(text_delta="错误草稿[2]"),
                    ModelChunk(
                        tool_calls=[
                            ToolCall(
                                call_id="finish-bad",
                                name="agent_finish",
                                arguments=_tool_arguments("ANSWERED", index=2),
                            )
                        ]
                    ),
                ]
            ),
            ScriptStep(
                [
                    ModelChunk(text_delta="正确回答[1]"),
                    ModelChunk(
                        tool_calls=[
                            ToolCall(
                                call_id="finish-good",
                                name="agent_finish",
                                arguments=_tool_arguments("ANSWERED"),
                            )
                        ]
                    ),
                ]
            ),
        ]
    )

    _run_context, _searcher, calls, events = await _execute(model, [_evidence()])
    deltas = [event.data["delta"] for event in events if event.type == "text.delta"]

    assert len(calls) == 2
    assert deltas == ["正确回答[1]"]


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
