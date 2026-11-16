"""单次运行的检索会话：缓存检索范围、分配证据编号、执行两段权限。

@author 称霸幼儿园
"""

import asyncio
import time
from collections.abc import Awaitable
from typing import Any, TypeVar

from elasticsearch import ApiError, TransportError

from clients._internal import InternalServiceError
from clients.knowledge import KnowledgeClient
from core.logger import get_logger
from harness.action.plane import FatalActionError, ToolExecutionError
from harness.action.policy import BoundAction
from harness.action.registry import ToolSpec
from harness.middleware import HarnessMiddleware, Hook, MiddlewareContext, MiddlewareDecision
from harness.models import ActionErrorCategory, RunContext, RunScope
from models.catalog import ModelCatalogSnapshot
from retrieval.evidence import EvidenceRegistry
from retrieval.index_reader import KnowledgeIndexReader
from retrieval.models import (
    KNOWLEDGE_ACCESS_UNAVAILABLE,
    NOT_FOUND_MESSAGE,
    SEARCH_UNAVAILABLE_MESSAGE,
    AuthorizationItem,
    KnowledgeScope,
)
from retrieval.prefilter import build_prefilter
from retrieval.settings import AUTHORIZE_BATCH_SIZE, RetrievalSettings

T = TypeVar("T")
CODE_NOT_FOUND = "A0404"
CODE_INVALID = "A0160"


class RetrievalSession:
    """绑定一次运行的身份、范围、参数快照与证据编号。

    @author 称霸幼儿园
    """

    def __init__(
        self,
        run_id: str,
        access_token: str,
        run_scope: RunScope | None,
        snapshot: ModelCatalogSnapshot | None,
        knowledge: KnowledgeClient,
        index: KnowledgeIndexReader | None,
    ):
        self.run_id = run_id
        self._access_token = access_token
        self.run_scope = run_scope if run_scope is not None and not run_scope.is_default else None
        self.snapshot = snapshot
        self.settings = snapshot.retrieval if snapshot is not None else RetrievalSettings()
        self.knowledge = knowledge
        self.index = index
        self.evidence = EvidenceRegistry()
        self._scope: KnowledgeScope | None = None
        self.prefetched = False
        self._logger = get_logger(__name__)

    @property
    def access_token(self) -> str:
        """返回当前运行的用户令牌。"""
        return self._access_token

    async def scope(self) -> KnowledgeScope:
        """取检索范围，每次运行只向 note 请求一次。

        :return: 检索范围
        """
        if self._scope is None:
            run_scope = self.run_scope
            self._scope = await self.call_note(
                self.knowledge.scope(
                    self._access_token,
                    run_scope.knowledge_base_ids if run_scope else None,
                    run_scope.refs if run_scope else None,
                )
            )
        return self._scope

    async def prefilter(self) -> list[dict[str, Any]]:
        """生成本次运行的预过滤条件。

        :return: bool.filter 条件列表
        """
        return build_prefilter(await self.scope(), self.run_scope)

    async def admin_default(self) -> bool:
        """返回是否为超管在默认范围内运行（此时须按普通成员口径复核）。

        :return: 是否需要复核
        """
        scope = await self.scope()
        return scope.admin and scope.default_scope

    async def authorize(self, items: list[tuple[str, str | None]]) -> dict[tuple[str, str | None], AuthorizationItem]:
        """第二段权限：按每批 100 条确认可读性，只返回可读项。

        :param items: （基础引用, 附属类型），可含重复
        :return: 可读项映射
        """
        unique = list(dict.fromkeys(items))
        readable: dict[tuple[str, str | None], AuthorizationItem] = {}
        for start in range(0, len(unique), AUTHORIZE_BATCH_SIZE):
            batch = unique[start : start + AUTHORIZE_BATCH_SIZE]
            results = await self.call_note(self.knowledge.authorize(self._access_token, batch))
            for request, result in zip(batch, results, strict=False):
                if result.readable:
                    self.evidence.set_mooc_id(result.item_key, result.mooc_id)
                    readable[request] = result
        return readable

    def in_run_scope(self, ref: str, kb_id: int | None) -> bool:
        """判断实体是否落在调用方显式范围内。

        :param ref: 基础引用
        :param kb_id: 所属知识库
        :return: 默认范围恒为真
        """
        if self.run_scope is None:
            return True
        return ref in self.run_scope.refs or (kb_id is not None and kb_id in self.run_scope.knowledge_base_ids)

    async def gate(self, ref: str, subtype: str | None) -> AuthorizationItem:
        """对按引用读取的实体做两段权限与范围确认；不通过时与不存在同样表述。

        :param ref: 基础引用
        :param subtype: 附属类型
        :return: 可读项
        """
        if ref.startswith("notice:"):
            raise ToolExecutionError(ActionErrorCategory.NOT_FOUND, NOT_FOUND_MESSAGE)
        readable = await self.authorize([(ref, subtype)])
        item = readable.get((ref, subtype))
        if item is None or not self.in_run_scope(ref, item.kb_id):
            raise ToolExecutionError(ActionErrorCategory.NOT_FOUND, NOT_FOUND_MESSAGE)
        if await self.admin_default():
            passed = await self.ordinary_check([item.item_key])
            if item.item_key not in passed:
                raise ToolExecutionError(ActionErrorCategory.NOT_FOUND, NOT_FOUND_MESSAGE)
        return item

    async def ordinary_check(self, item_keys: list[str]) -> set[str]:
        """超管默认范围下，用预过滤（普通成员口径）复核条目键。

        :param item_keys: 条目键
        :return: 通过复核的条目键
        """
        if not await self.admin_default():
            return set(item_keys)
        filters = await self.prefilter()
        return await self.call_index(self._require_index().matching_item_keys(item_keys, filters))

    async def call_note(self, awaitable: Awaitable[T]) -> T:
        """调用 note 并归类错误：不存在或不可读、参数错误交还模型，其余视为权限无法确认。

        :param awaitable: note 调用
        :return: 调用结果
        """
        try:
            return await awaitable
        except InternalServiceError as error:
            if error.code == CODE_NOT_FOUND:
                raise ToolExecutionError(ActionErrorCategory.NOT_FOUND, NOT_FOUND_MESSAGE) from error
            if error.code == CODE_INVALID:
                raise ToolExecutionError(ActionErrorCategory.INVALID_ARGUMENTS, error.message) from error
            self._logger.error("note 知识端点不可用 runId=%s code=%s", self.run_id, error.code)
            raise FatalActionError(KNOWLEDGE_ACCESS_UNAVAILABLE) from error

    async def call_index(self, awaitable: Awaitable[T], message: str = SEARCH_UNAVAILABLE_MESSAGE) -> T:
        """调用 Elasticsearch，不可用时告诉模型换用其他通道。

        :param awaitable: 索引查询
        :param message: 交还模型的提示
        :return: 查询结果
        """
        try:
            return await awaitable
        except (ApiError, TransportError) as error:
            self._logger.warning("知识索引不可用 runId=%s type=%s", self.run_id, type(error).__name__)
            raise ToolExecutionError(ActionErrorCategory.DEPENDENCY_UNAVAILABLE, message) from error

    def _require_index(self) -> KnowledgeIndexReader:
        if self.index is None:
            raise ToolExecutionError(ActionErrorCategory.DEPENDENCY_UNAVAILABLE, SEARCH_UNAVAILABLE_MESSAGE)
        return self.index

    def index_reader(self, message: str = SEARCH_UNAVAILABLE_MESSAGE) -> KnowledgeIndexReader:
        """返回索引读取器，未配置时按依赖不可用处理。

        :param message: 交还模型的提示
        :return: 索引读取器
        """
        if self.index is None:
            raise ToolExecutionError(ActionErrorCategory.DEPENDENCY_UNAVAILABLE, message)
        return self.index


class RetrievalSessionStore:
    """按运行标识保存检索会话，运行结束时释放。

    @author 称霸幼儿园
    """

    def __init__(self, knowledge: KnowledgeClient, index: KnowledgeIndexReader | None):
        self._knowledge = knowledge
        self._index = index
        self._sessions: dict[str, RetrievalSession] = {}

    def for_action(self, action: BoundAction) -> RetrievalSession:
        """取得或创建行动所属运行的会话。

        :param action: 已绑定身份的行动
        :return: 检索会话
        """
        session = self._sessions.get(action.run_id)
        if session is None:
            session = RetrievalSession(
                run_id=action.run_id,
                access_token=action.access_token,
                run_scope=action.scope,
                snapshot=action.model_snapshot,
                knowledge=self._knowledge,
                index=self._index,
            )
            self._sessions[action.run_id] = session
        return session

    def for_run(self, run: RunContext) -> RetrievalSession:
        """取得或创建运行级检索会话。

        :param run: 当前运行上下文
        :return: 检索会话
        """
        session = self._sessions.get(run.run_id)
        if session is None:
            session = RetrievalSession(
                run_id=run.run_id,
                access_token=run.access_token,
                run_scope=run.request.scope,
                snapshot=run.model_snapshot,
                knowledge=self._knowledge,
                index=self._index,
            )
            self._sessions[run.run_id] = session
        return session

    def release(self, run_id: str) -> None:
        """释放运行的会话。

        :param run_id: 运行标识
        """
        self._sessions.pop(run_id, None)

    def __contains__(self, run_id: str) -> bool:
        return run_id in self._sessions


class RetrievalSessionMiddleware(HarnessMiddleware):
    """准备权限范围、首轮检索并管理检索会话生命周期。

    @author 称霸幼儿园
    """

    def __init__(self, store: RetrievalSessionStore, prefetch_tool: ToolSpec | None = None):
        self._store = store
        self._prefetch_tool = prefetch_tool

    async def handle(self, context: MiddlewareContext) -> MiddlewareDecision:
        """准备权限范围、预取首轮证据并在运行结束时释放会话。

        :param context: 中间件输入
        :return: 放行决定
        """
        run = context.run
        if run.agent.name != "knowledge-retrieval":
            if context.hook == Hook.AFTER_RUN:
                self._store.release(run.run_id)
            return MiddlewareDecision()

        if context.hook == Hook.BEFORE_RUN:
            session = self._store.for_run(run)
            try:
                scope = await session.scope()
            except Exception:
                run.scope_summary = self._scope_summary(run.request.scope, None)
                raise
            run.scope_summary = self._scope_summary(run.request.scope, scope)
        elif (
            context.hook == Hook.BEFORE_PREPARE
            and self._prefetch_tool is not None
            and run.runtime.prefetch_enabled
        ):
            session = self._store.for_run(run)
            if not session.prefetched:
                session.prefetched = True
                await self._prefetch(context)
        if context.hook == Hook.AFTER_RUN:
            self._store.release(context.run.run_id)
        return MiddlewareDecision()

    async def _prefetch(self, context: MiddlewareContext) -> None:
        """以原始问题执行一次检索并写入证据工作区。

        :param context: Harness 挂载点输入
        """
        from tools.knowledge.args import KbSearchArgs

        started = time.monotonic()
        call_id = f"prefetch-{context.run.run_id}"
        if context.events is not None:
            await context.events.emit(
                "tool.started",
                {
                    "callId": call_id,
                    "name": self._prefetch_tool.name,
                    "summary": self._prefetch_tool.summary,
                },
            )
        try:
            arguments = KbSearchArgs(query=context.run.request.input)
            action = BoundAction(
                run_id=context.run.run_id,
                agent_version=context.run.agent.version,
                access_token=context.run.access_token,
                tool=self._prefetch_tool,
                arguments=arguments,
                scope=context.run.request.scope,
                model_snapshot=context.run.model_snapshot,
            )
            output = await asyncio.wait_for(
                self._prefetch_tool.handler(arguments, action),
                timeout=context.run.runtime.tool_timeout_s,
            )
            context.run.workspace.add_evidence(
                [
                    item.model_copy(update={"selected_reason": "按原句预先检索的候选"})
                    for item in output.evidence or []
                ]
            )
            result = {
                "callId": call_id,
                "name": self._prefetch_tool.name,
                "status": "PARTIAL" if output.partial else "SUCCESS",
                "hitCount": len(output.evidence or []),
                "durationMs": int((time.monotonic() - started) * 1000),
                "errorCategory": None,
                "retryable": False,
            }
        except ToolExecutionError as error:
            context.run.hints.append(f"首轮检索未完成：{error}")
            result = {
                "callId": call_id,
                "name": self._prefetch_tool.name,
                "status": "FAILED",
                "hitCount": 0,
                "durationMs": int((time.monotonic() - started) * 1000),
                "errorCategory": error.category.value,
                "retryable": error.retryable,
            }
        except TimeoutError:
            context.run.hints.append("首轮检索未完成：TOOL_TIMEOUT")
            result = {
                "callId": call_id,
                "name": self._prefetch_tool.name,
                "status": "FAILED",
                "hitCount": 0,
                "durationMs": int((time.monotonic() - started) * 1000),
                "errorCategory": ActionErrorCategory.TOOL_TIMEOUT.value,
                "retryable": True,
            }
        if context.events is not None:
            await context.events.emit("tool.finished", result)

    @staticmethod
    def _scope_summary(run_scope: RunScope | None, scope: KnowledgeScope | None) -> str:
        """生成只含本次范围名称与实体标识的摘要。

        :param run_scope: 请求中的检索范围
        :param scope: note 权限确认后的范围
        :return: 检索范围摘要
        """
        if run_scope is None or run_scope.is_default:
            return "默认范围"
        names = {item.kb_id: item.name for item in scope.knowledge_bases} if scope is not None else {}
        values = [names.get(kb_id) or str(kb_id) for kb_id in run_scope.knowledge_base_ids]
        values.extend(run_scope.refs)
        return "、".join(dict.fromkeys(values)) or "默认范围"
