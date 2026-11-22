"""运行会话的创建、流式读取与取消。

@author 称霸幼儿园
"""

import asyncio
import time
from dataclasses import dataclass

from elasticsearch import AsyncElasticsearch

from agents import load_agent
from clients.file import FileClient
from clients.knowledge import KnowledgeClient
from clients.model_provider import ModelProviderClient
from core.config import RuntimeConfigStore, Settings
from core.errors import RUN_CANCELLED_MESSAGE, RUN_NOT_FOUND_MESSAGE, ApiError
from harness.events import EventBus
from harness.action.registry import ToolRegistry
from harness.loop import Harness
from harness.models import RunContext, RunOutcome, RunRequest, RunState
from models.base import ChatModel
from retrieval.index_reader import KnowledgeIndexReader
from retrieval.search import HybridSearcher
from retrieval.session import RetrievalSessionMiddleware, RetrievalSessionStore
from tools.knowledge import register_knowledge_tools
from tools.knowledge.common import KnowledgeToolContext, VisualRenderLimiter


@dataclass
class RunSession:
    """一个进程内运行会话。"""

    context: RunContext
    events: EventBus
    task: asyncio.Task | None = None
    finished_at: float | None = None


class RunManager:
    """管理进程内运行，不持久化业务状态。

    @author 称霸幼儿园
    """

    def __init__(
        self,
        settings: Settings,
        config_store: RuntimeConfigStore,
        providers: ModelProviderClient,
        model: ChatModel,
        knowledge: KnowledgeClient | None = None,
        index: KnowledgeIndexReader | None = None,
        searcher: HybridSearcher | None = None,
        index_client: AsyncElasticsearch | None = None,
        file_client: FileClient | None = None,
    ):
        self._settings = settings
        self._config_store = config_store
        self._providers = providers
        self._retrieval_store = RetrievalSessionStore(knowledge, index) if knowledge is not None else None
        self._index_client = index_client
        self._file_client = file_client or FileClient(settings)
        self._render_limiter = VisualRenderLimiter(
            config_store.get().harness.visual_render_concurrency
        )
        self._registry = ToolRegistry()
        self._middlewares = []
        if self._retrieval_store is not None and searcher is not None:
            register_knowledge_tools(
                self._registry,
                KnowledgeToolContext(
                    store=self._retrieval_store,
                    searcher=searcher,
                    file_client=self._file_client,
                    render_limiter=self._render_limiter,
                ),
            )
            self._middlewares.append(
                RetrievalSessionMiddleware(self._retrieval_store, self._registry.get("kb_search"))
            )
        self._harness = Harness(model, registry=self._registry, middlewares=self._middlewares)
        self._sessions: dict[str, RunSession] = {}

    async def create(self, request: RunRequest, access_token: str) -> RunSession:
        """使用最新模型快照创建并启动运行。

        :param request: 运行请求
        :param access_token: 当前用户令牌
        :return: 运行会话
        """
        self._purge_finished()
        if request.run_id in self._sessions:
            raise ApiError(400, "A0160", "请求参数错误")
        if request.agent == "knowledge-retrieval" and (
            self._retrieval_store is None or not self._middlewares
        ):
            raise ApiError(503, "A0503", "服务暂时不可用，请稍后重试")
        snapshot = await self._providers.snapshot()
        settings_snapshot = self._config_store.get()
        runtime = settings_snapshot.harness
        await self._render_limiter.configure(runtime.visual_render_concurrency)
        context = RunContext(
            request=request,
            agent=load_agent(request.agent),
            runtime=runtime,
            model_snapshot=snapshot,
            access_token=access_token,
            ocr_enabled=settings_snapshot.indexer.ocr_enabled,
        )
        session = RunSession(
            context=context,
            events=EventBus(request.run_id, runtime.heartbeat_interval_s),
        )
        self._sessions[request.run_id] = session
        session.task = asyncio.create_task(self._execute(session))
        return session

    async def cancel(self, run_id: str) -> dict:
        """取消活跃运行或返回已有终态。

        :param run_id: 运行标识
        :return: 取消受理状态
        """
        self._purge_finished()
        session = self._sessions.get(run_id)
        if session is None:
            raise ApiError(404, "A0404", RUN_NOT_FOUND_MESSAGE)
        terminal = session.context.state in {
            RunState.COMPLETED,
            RunState.FAILED,
            RunState.CANCELLED,
        }
        if terminal:
            return {
                "runId": run_id,
                "accepted": False,
                "state": session.context.state.value,
            }
        session.context.cancel()
        if session.task:
            session.task.cancel()
        return {"runId": run_id, "accepted": True, "state": RunState.CANCELLED.value}

    async def drain(self, session: RunSession) -> None:
        """在调用方断开后排空收尾事件，避免终态丢失。

        :param session: 运行会话
        """
        async for _event in session.events.events():
            pass

    async def close(self) -> None:
        """取消并等待全部活跃运行。"""
        for session in list(self._sessions.values()):
            if session.context.state not in {RunState.COMPLETED, RunState.FAILED, RunState.CANCELLED}:
                session.context.cancel()
                if session.task:
                    session.task.cancel()
        tasks = [session.task for session in self._sessions.values() if session.task]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._sessions.clear()
        if self._index_client is not None:
            await self._index_client.close()

    async def _execute(self, session: RunSession) -> None:
        try:
            await self._harness.run(session.context, session.events)
        except asyncio.CancelledError:
            session.context.state = RunState.CANCELLED
            session.context.outcome = RunOutcome.CANCELLED
            await session.events.emit(
                "error",
                {"category": "CANCELLED", "retryable": False, "message": RUN_CANCELLED_MESSAGE},
            )
            await session.events.emit(
                "run.finished",
                {
                    "state": RunState.CANCELLED.value,
                    "outcome": RunOutcome.CANCELLED.value,
                    "evidence": [],
                    "answerNotices": [],
                    "unfinished": [],
                    "visualDispatches": [
                        item.model_dump(mode="json", by_alias=True)
                        for item in session.context.visual_dispatches
                    ],
                },
            )
        finally:
            session.finished_at = time.monotonic()
            await session.events.close()

    def _purge_finished(self) -> None:
        threshold = time.monotonic() - self._settings.RUN_TERMINAL_TTL_S
        expired = [
            run_id
            for run_id, session in self._sessions.items()
            if session.finished_at is not None and session.finished_at < threshold
        ]
        for run_id in expired:
            del self._sessions[run_id]
