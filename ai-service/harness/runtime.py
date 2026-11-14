"""运行会话的创建、流式读取与取消。

@author 称霸幼儿园
"""

import asyncio
import time
from dataclasses import dataclass

from agents.minimal.agent import load_minimal_agent
from clients.model_provider import ModelProviderClient
from core.config import RuntimeConfigStore, Settings
from core.errors import RUN_CANCELLED_MESSAGE, RUN_NOT_FOUND_MESSAGE, ApiError
from harness.events import EventBus
from harness.loop import Harness
from harness.models import RunContext, RunOutcome, RunRequest, RunState
from models.base import ChatModel


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
    ):
        self._settings = settings
        self._config_store = config_store
        self._providers = providers
        self._harness = Harness(model)
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
        snapshot = await self._providers.snapshot()
        runtime = self._config_store.get().harness
        context = RunContext(
            request=request,
            agent=load_minimal_agent(),
            runtime=runtime,
            model_snapshot=snapshot,
            access_token=access_token,
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
                    "unfinished": [],
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
