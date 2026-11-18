"""Harness 的传输无关数据模型。

@author 称霸幼儿园
"""

import asyncio
import hashlib
import json
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from core.config import HarnessRuntimeSettings


class RunState(StrEnum):
    CREATED = "CREATED"
    RUNNING = "RUNNING"
    VERIFYING = "VERIFYING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class RunOutcome(StrEnum):
    ANSWERED = "ANSWERED"
    NOT_FOUND = "NOT_FOUND"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class HistoryCitation(BaseModel):
    """历史回答在原轮次中使用的引用编号、标题与来源标识。

    @author 称霸幼儿园
    """

    index: int = Field(ge=1)
    title: str | None = None
    ref: str | None = None
    subtype: str | None = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ChatMessage(BaseModel):
    """会话消息。

    @author 称霸幼儿园
    """

    role: Literal["system", "user", "assistant", "tool"]
    content: str
    summary: bool = False
    citations: list[HistoryCitation] = Field(default_factory=list)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


SCOPE_REF_PATTERN = re.compile(r"^(kb|note|doc|mooc|mooc_item|task):[1-9]\d*$")


class RunScope(BaseModel):
    """一次运行的检索范围：两个列表都为空是默认范围，非空时只能收窄。

    @author 称霸幼儿园
    """

    knowledge_base_ids: list[int] = Field(default_factory=list)
    refs: list[str] = Field(default_factory=list)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @field_validator("knowledge_base_ids")
    @classmethod
    def _positive_ids(cls, value: list[int]) -> list[int]:
        if any(item <= 0 for item in value):
            raise ValueError("knowledgeBaseIds must be positive")
        return list(dict.fromkeys(value))

    @field_validator("refs")
    @classmethod
    def _valid_refs(cls, value: list[str]) -> list[str]:
        if any(not SCOPE_REF_PATTERN.match(item) for item in value):
            raise ValueError("refs must be entity refs")
        return list(dict.fromkeys(value))

    @property
    def is_default(self) -> bool:
        """返回是否为默认范围。"""
        return not self.knowledge_base_ids and not self.refs


class RunRequest(BaseModel):
    """内部运行请求。

    @author 称霸幼儿园
    """

    run_id: str = Field(min_length=1, max_length=128)
    input: str = Field(min_length=1)
    agent: Literal["minimal", "knowledge-retrieval"] = "minimal"
    conversation_id: str | int | None = None
    history: list[ChatMessage] = Field(default_factory=list)
    scope: RunScope | None = None
    model: str | None = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class TokenUsage(BaseModel):
    """模型 token 用量，未知字段保持空值。

    @author 称霸幼儿园
    """

    prompt_tokens: int | None = Field(default=None, ge=0)
    completion_tokens: int | None = Field(default=None, ge=0)
    total_tokens: int | None = Field(default=None, ge=0)
    reasoning_tokens: int | None = Field(default=None, ge=0)
    known: bool = False

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    def plus(self, other: "TokenUsage") -> "TokenUsage":
        """合并两次调用的用量。

        :param other: 另一次调用用量
        :return: 汇总用量
        """
        def add(left: int | None, right: int | None) -> int | None:
            return None if left is None and right is None else (left or 0) + (right or 0)

        return TokenUsage(
            prompt_tokens=add(self.prompt_tokens, other.prompt_tokens),
            completion_tokens=add(self.completion_tokens, other.completion_tokens),
            total_tokens=add(self.total_tokens, other.total_tokens),
            reasoning_tokens=add(self.reasoning_tokens, other.reasoning_tokens),
            known=self.known or other.known,
        )


class ToolCall(BaseModel):
    """模型发起的工具调用。

    @author 称霸幼儿园
    """

    call_id: str
    name: str = Field(min_length=1)
    arguments: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ModelChunk(BaseModel):
    """模型流式输出片段。

    @author 称霸幼儿园
    """

    text_delta: str | None = None
    reasoning_delta: str | None = None
    reasoning_interrupted: bool = False
    tool_calls: list[ToolCall] = Field(default_factory=list)
    usage: TokenUsage | None = None
    reasoning_tokens: int | None = Field(default=None, ge=0)
    finish: bool = False

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class EvidenceItem(BaseModel):
    """进入运行工作区的证据条目。

    @author 称霸幼儿园
    """

    evidence_id: str
    source_type: str
    source_id: str
    content: str
    version: str | None = None
    permission_basis: str | None = None
    selected_reason: str | None = None
    title: str | None = None
    locator: dict[str, Any] | None = None
    kb_id: int | None = None
    kb_name: str | None = None
    authority: str | None = None
    stale: bool = False
    retrieval: dict[str, Any] | None = None
    # 清单、目录、关系结果里的一行：只有标题与属性、没有原文，引用时只核对编号；
    # 此时 content 是服务端生成的来源摘要，可为空。
    structured: bool = False

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ActionStatus(StrEnum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    PARTIAL = "PARTIAL"


class ActionErrorCategory(StrEnum):
    INVALID_ARGUMENTS = "INVALID_ARGUMENTS"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    TOOL_TIMEOUT = "TOOL_TIMEOUT"
    DEPENDENCY_UNAVAILABLE = "DEPENDENCY_UNAVAILABLE"
    TRANSIENT = "TRANSIENT"
    NOT_FOUND = "NOT_FOUND"
    INTERNAL = "INTERNAL"


class ActionResult(BaseModel):
    """行动面的统一结果。

    @author 称霸幼儿园
    """

    call_id: str
    tool_name: str
    status: ActionStatus
    content: str = ""
    error_category: ActionErrorCategory | None = None
    retryable: bool = False
    duration_ms: int = 0
    action_key: str = Field(default="", exclude=True)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    diagnostics: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Observation(BaseModel):
    """写回运行状态的紧凑观察。

    @author 称霸幼儿园
    """

    call_id: str
    tool_name: str
    status: ActionStatus
    content: str
    result_ref: str | None = None
    error_category: ActionErrorCategory | None = None
    retryable: bool = False
    duration_ms: int = 0
    action_key: str = Field(default="", exclude=True)
    diagnostics: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ToolExchange(BaseModel):
    """一轮模型发起的工具调用及其观察结果。

    @author 称霸幼儿园
    """

    calls: list[ToolCall] = Field(default_factory=list)
    observations: list[Observation] = Field(default_factory=list)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class AgentDefinition(BaseModel):
    """受版本管理的 Agent 契约。

    @author 称霸幼儿园
    """

    name: str
    version: str
    goal: str
    instructions: str
    main_model: str = "agent_main"
    compact_model: str = "fast"
    tools: list[str] = Field(default_factory=list)
    terminal_tool: str | None = None
    context_policy: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


@dataclass
class RunWorkspace:
    """仅存在于单次运行内存中的工作区。"""

    _results: dict[str, str] = field(default_factory=dict)
    _evidence: dict[str, EvidenceItem] = field(default_factory=dict)

    def put_result(self, content: str) -> str:
        """保存大结果并返回引用。

        :param content: 完整结果
        :return: 工作区引用
        """
        reference = f"result:{uuid.uuid4()}"
        self._results[reference] = content
        return reference

    def get_result(self, reference: str) -> str | None:
        """按引用读取完整结果。

        :param reference: 工作区引用
        :return: 完整结果或空值
        """
        return self._results.get(reference)

    def add_evidence(self, items: list[EvidenceItem]) -> int:
        """按证据标识去重写入。

        :param items: 候选证据
        :return: 新增条数
        """
        before = len(self._evidence)
        for item in items:
            self._evidence.setdefault(item.evidence_id, item)
        return len(self._evidence) - before

    @property
    def evidence(self) -> list[EvidenceItem]:
        """返回按写入顺序排列的证据。"""
        return list(self._evidence.values())

    def evidence_fingerprint(self) -> str:
        """返回证据集合的稳定摘要。

        :return: SHA-256 摘要
        """
        value = json.dumps(sorted(self._evidence), ensure_ascii=False)
        return hashlib.sha256(value.encode("utf-8")).hexdigest()


@dataclass
class RunContext:
    """单次运行的可变状态，只能由核心循环提交变更。"""

    request: RunRequest
    agent: AgentDefinition
    runtime: HarnessRuntimeSettings
    model_snapshot: Any
    access_token: str = field(repr=False)
    state: RunState = RunState.CREATED
    history: list[ChatMessage] = field(default_factory=list)
    observations: list[Observation] = field(default_factory=list)
    tool_exchanges: list[ToolExchange] = field(default_factory=list)
    workspace: RunWorkspace = field(default_factory=RunWorkspace)
    usage: TokenUsage = field(default_factory=TokenUsage)
    model_turns: int = 0
    tool_calls: int = 0
    verification_attempts: int = 0
    hints: list[str] = field(default_factory=list)
    budget_hints: list[str] = field(default_factory=list)
    last_hints: list[str] = field(default_factory=list)
    force_finish: bool = False
    answer: str = ""
    answer_notices: list[str] = field(default_factory=list)
    outcome: RunOutcome | None = None
    error_category: str | None = None
    error_message: str | None = None
    scope_summary: str | None = None
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    action_signatures: list[str] = field(default_factory=list)
    evidence_fingerprints: list[str] = field(default_factory=list)
    action_errors: list[str] = field(default_factory=list)
    no_progress_strikes: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    monotonic_started: float = field(default_factory=time.monotonic)

    def __post_init__(self) -> None:
        if not self.history:
            self.history = list(self.request.history)

    @property
    def run_id(self) -> str:
        """返回运行标识。"""
        return self.request.run_id

    @property
    def elapsed_s(self) -> float:
        """返回运行已经经过的秒数。"""
        return time.monotonic() - self.monotonic_started

    @property
    def cancelled(self) -> bool:
        """返回调用方是否已请求取消。"""
        return self.cancel_event.is_set()

    def cancel(self) -> None:
        """记录取消请求。"""
        self.cancel_event.set()

    def apply_updates(self, updates: dict[str, Any]) -> None:
        """应用中间件允许的状态变更。

        :param updates: 状态字段与值
        """
        allowed = {"force_finish", "budget_hints"}
        for key, value in updates.items():
            if key in allowed:
                setattr(self, key, value)
