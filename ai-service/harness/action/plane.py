"""工具行动面：校验、身份绑定、策略、执行与观察。

@author 称霸幼儿园
"""

import asyncio
import json
import time

from pydantic import ValidationError

from harness.action.policy import BoundAction, ReadOnlyActionPolicy
from harness.action.registry import ToolOutput, ToolRegistry
from harness.models import (
    ActionErrorCategory,
    ActionResult,
    ActionStatus,
    Observation,
    RunContext,
    ToolCall,
)


class ToolExecutionError(RuntimeError):
    """工具主动声明的分类错误。"""

    def __init__(
        self,
        category: ActionErrorCategory,
        message: str = "",
        retryable: bool = False,
    ):
        super().__init__(message)
        self.category = category
        self.retryable = retryable


class ActionPlane:
    """统一执行模型发起的工具请求。

    @author 称霸幼儿园
    """

    def __init__(self, registry: ToolRegistry, policy: ReadOnlyActionPolicy | None = None):
        self._registry = registry
        self._policy = policy or ReadOnlyActionPolicy()

    async def execute(self, run: RunContext, call: ToolCall) -> ActionResult:
        """执行一次工具调用并返回分类结果。

        :param run: 当前运行
        :param call: 模型工具请求
        :return: 行动结果
        """
        started = time.monotonic()
        spec = self._registry.get(call.name)
        if spec is None:
            return self._failure(call, ActionErrorCategory.NOT_FOUND, started)
        try:
            arguments = spec.args_model.model_validate(call.arguments)
        except ValidationError as error:
            result = self._failure(call, ActionErrorCategory.INVALID_ARGUMENTS, started)
            result.content = error.json()
            return result
        action = BoundAction(
            run_id=run.run_id,
            agent_version=run.agent.version,
            access_token=run.access_token,
            tool=spec,
            arguments=arguments,
        )
        policy = self._policy.evaluate(run, action)
        if not policy.allowed:
            result = self._failure(call, ActionErrorCategory.PERMISSION_DENIED, started)
            result.content = policy.reason or "DENIED"
            return result
        try:
            output = await asyncio.wait_for(
                spec.handler(arguments, action),
                timeout=spec.timeout_s or run.runtime.tool_timeout_s,
            )
            return ActionResult(
                call_id=call.call_id,
                tool_name=call.name,
                status=ActionStatus.PARTIAL if output.partial else ActionStatus.SUCCESS,
                content=output.content,
                duration_ms=self._duration(started),
                action_key=self._key(call),
                evidence=output.evidence or [],
            )
        except TimeoutError:
            return self._failure(call, ActionErrorCategory.TOOL_TIMEOUT, started, retryable=True)
        except ToolExecutionError as error:
            result = self._failure(call, error.category, started, retryable=error.retryable)
            result.content = str(error)
            return result
        except asyncio.CancelledError:
            raise
        except Exception:
            return self._failure(call, ActionErrorCategory.INTERNAL, started)

    def observe(self, run: RunContext, result: ActionResult) -> Observation:
        """将完整行动结果压缩成可写回状态的观察。

        :param run: 当前运行
        :param result: 完整行动结果
        :return: 紧凑观察
        """
        content = result.content
        reference = None
        if len(content) > run.runtime.large_result_chars:
            reference = run.workspace.put_result(content)
            content = content[: run.runtime.large_result_preview_chars]
        run.workspace.add_evidence(result.evidence)
        observation = Observation(
            call_id=result.call_id,
            tool_name=result.tool_name,
            status=result.status,
            content=content,
            result_ref=reference,
            error_category=result.error_category,
            retryable=result.retryable,
            duration_ms=result.duration_ms,
            action_key=result.action_key,
        )
        run.observations.append(observation)
        return observation

    @staticmethod
    def _duration(started: float) -> int:
        return int((time.monotonic() - started) * 1000)

    @staticmethod
    def _failure(
        call: ToolCall,
        category: ActionErrorCategory,
        started: float,
        retryable: bool = False,
    ) -> ActionResult:
        return ActionResult(
            call_id=call.call_id,
            tool_name=call.name,
            status=ActionStatus.FAILED,
            error_category=category,
            retryable=retryable,
            duration_ms=ActionPlane._duration(started),
            action_key=ActionPlane._key(call),
        )

    @staticmethod
    def _key(call: ToolCall) -> str:
        return call.name + ":" + json.dumps(
            call.arguments,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
