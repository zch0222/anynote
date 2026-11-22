"""运行管理器取消与终态测试。

@author 称霸幼儿园
"""

import asyncio

from core.config import RuntimeConfigStore, Settings
from harness.models import ModelChunk, RunOutcome, RunRequest, RunState, ToolCall
from harness.runtime import RunManager
from models.catalog import ModelCatalogSnapshot
from models.scripted import ScriptedModel, ScriptStep
from retrieval.search import HybridSearcher
from tests.knowledge_fakes import FakeIndexReader, FakeKnowledgeClient


class Providers:
    async def snapshot(self):
        return ModelCatalogSnapshot(version="0:0")


async def test_cancel_active_run_is_accepted_once():
    """活跃运行接受取消，取消后的重复请求返回原终态。"""
    settings = Settings(NACOS_SERVER_ADDRESS="")
    manager = RunManager(
        settings,
        RuntimeConfigStore(settings.runtime_defaults()),
        Providers(),
        ScriptedModel([ScriptStep(delay_s=10)]),
    )
    session = await manager.create(RunRequest(run_id="cancel-1", input="问题"), "token")
    await asyncio.sleep(0.01)
    accepted = await manager.cancel("cancel-1")
    assert session.task is not None
    await session.task
    repeated = await manager.cancel("cancel-1")
    assert accepted == {"runId": "cancel-1", "accepted": True, "state": "CANCELLED"}
    assert repeated["accepted"] is False
    assert repeated["state"] == RunState.CANCELLED.value
    await manager.close()


async def test_create_loads_knowledge_agent_and_registers_its_tools():
    """RunManager 为知识检索运行装载 Agent、只读工具与首轮预取。"""
    settings = Settings(NACOS_SERVER_ADDRESS="")
    model = ScriptedModel(
        [
            ScriptStep(
                [
                    ModelChunk(
                        tool_calls=[
                            ToolCall(
                                call_id="finish-none",
                                name="agent_finish",
                                arguments={"outcome": "NOT_FOUND"},
                            )
                        ]
                    )
                ]
            )
        ]
    )
    manager = RunManager(
        settings,
        RuntimeConfigStore(settings.runtime_defaults()),
        Providers(),
        model,
        knowledge=FakeKnowledgeClient(),
        index=FakeIndexReader(),  # type: ignore[arg-type]
        searcher=HybridSearcher(None),
    )

    session = await manager.create(
        RunRequest(run_id="knowledge-agent-1", input="问题", agent="knowledge-retrieval"),
        "token",
    )
    assert session.task is not None
    await session.task
    events = [event async for event in session.events.events()]

    assert session.context.agent.name == "knowledge-retrieval"
    assert set(session.context.agent.tools) == {
        "kb_list",
        "kb_outline",
        "kb_search",
        "kb_grep",
        "kb_read",
        "kb_query",
        "kb_related",
        "kb_view_doc",
    }
    assert session.context.outcome == RunOutcome.NOT_FOUND
    registered = {item["function"]["name"] for item in model.calls[0]["tools"]}
    assert registered == {
        "kb_list",
        "kb_outline",
        "kb_search",
        "kb_grep",
        "kb_read",
        "kb_query",
        "kb_related",
        "kb_view_doc",
        "agent_finish",
    }
    assert any(event.type == "run.finished" for event in events)
    assert not any(event.type == "tool.started" and event.data["name"] == "kb_search" for event in events)
    assert events[-1].data["answerNotices"] == []
    await manager.close()
