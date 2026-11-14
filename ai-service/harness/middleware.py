"""中间件挂载点与结构化决定。

@author 称霸幼儿园
"""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from harness.models import RunContext, RunOutcome


class Hook(StrEnum):
    BEFORE_RUN = "before_run"
    AFTER_RUN = "after_run"
    BEFORE_PREPARE = "before_prepare"
    AFTER_PREPARE = "after_prepare"
    BEFORE_MODEL = "before_model"
    AFTER_MODEL = "after_model"
    BEFORE_ACT = "before_act"
    AFTER_ACT = "after_act"
    BEFORE_STATE = "before_state"
    AFTER_STATE = "after_state"
    BEFORE_VERIFY = "before_verify"
    AFTER_VERIFY = "after_verify"


class DecisionType(StrEnum):
    ALLOW = "ALLOW"
    MODIFY = "MODIFY"
    SHORT_CIRCUIT = "SHORT_CIRCUIT"
    APPEND = "APPEND"


@dataclass
class MiddlewareDecision:
    """中间件返回给核心循环的决定。"""

    type: DecisionType = DecisionType.ALLOW
    payload: Any = None
    outcome: RunOutcome | None = None
    error_category: str | None = None
    message: str | None = None
    state_updates: dict[str, Any] = field(default_factory=dict)
    append: list[str] = field(default_factory=list)

    @classmethod
    def modify(cls, payload: Any) -> "MiddlewareDecision":
        return cls(type=DecisionType.MODIFY, payload=payload)

    @classmethod
    def short_circuit(
        cls,
        outcome: RunOutcome,
        category: str,
        message: str,
    ) -> "MiddlewareDecision":
        return cls(
            type=DecisionType.SHORT_CIRCUIT,
            outcome=outcome,
            error_category=category,
            message=message,
        )


@dataclass
class MiddlewareContext:
    """一次挂载点调用的输入。"""

    run: RunContext
    hook: Hook
    payload: Any = None


class HarnessMiddleware:
    """中间件基类。

    @author 称霸幼儿园
    """

    async def handle(self, context: MiddlewareContext) -> MiddlewareDecision:
        """处理一个挂载点。

        :param context: 挂载点输入
        :return: 结构化决定
        """
        return MiddlewareDecision()


class MiddlewareChain:
    """按注册顺序执行中间件并提交决定。

    @author 称霸幼儿园
    """

    def __init__(self, middlewares: list[HarnessMiddleware] | None = None):
        self._middlewares = middlewares or []

    async def invoke(
        self,
        hook: Hook,
        run: RunContext,
        payload: Any = None,
    ) -> MiddlewareDecision:
        """执行指定挂载点。

        :param hook: 生命周期挂载点
        :param run: 当前运行
        :param payload: 当前阶段数据
        :return: 聚合后的决定
        """
        combined = MiddlewareDecision(payload=payload)
        for middleware in self._middlewares:
            context = MiddlewareContext(run=run, hook=hook, payload=combined.payload)
            decision = await middleware.handle(context)
            if decision.type == DecisionType.MODIFY:
                combined.type = DecisionType.MODIFY
                combined.payload = decision.payload
            combined.state_updates.update(decision.state_updates)
            combined.append.extend(decision.append)
            if decision.type == DecisionType.SHORT_CIRCUIT:
                return decision
        run.hints.extend(combined.append)
        run.apply_updates(combined.state_updates)
        return combined
