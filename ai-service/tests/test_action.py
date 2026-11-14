"""行动面单元测试。

@author 称霸幼儿园
"""

import asyncio

from pydantic import BaseModel

from harness.action.plane import ActionPlane, ToolExecutionError
from harness.action.policy import ReadOnlyActionPolicy
from harness.action.registry import ToolOutput, ToolRegistry, ToolSpec
from harness.models import ActionErrorCategory, ActionStatus, EvidenceItem, ToolCall
from tests.conftest import make_run


class SearchArgs(BaseModel):
    query: str


def registry_with(handler, read_only=True, timeout_s=None):
    registry = ToolRegistry()
    registry.register(
        ToolSpec(
            name="search",
            summary="搜索测试资料",
            description="测试只读工具",
            args_model=SearchArgs,
            handler=handler,
            read_only=read_only,
            timeout_s=timeout_s,
        )
    )
    return registry


async def test_invalid_arguments_do_not_execute_handler():
    """参数校验失败时处理器不执行并返回参数错误。"""
    called = False

    async def handler(_args, _action):
        nonlocal called
        called = True
        return ToolOutput("ok")

    result = await ActionPlane(registry_with(handler)).execute(
        make_run(["search"]),
        ToolCall(call_id="c1", name="search", arguments={"query": 1}),
    )
    assert result.error_category == ActionErrorCategory.INVALID_ARGUMENTS
    assert called is False


async def test_identity_policy_execution_and_large_observation():
    """行动绑定运行身份，大结果外置且证据去重。"""
    observed = {}

    async def handler(args, action):
        observed["runId"] = action.run_id
        observed["token"] = action.access_token
        observed["query"] = args.query
        return ToolOutput(
            "x" * 300,
            [EvidenceItem(evidence_id="e1", source_type="note", source_id="1", content="正文")],
        )

    run = make_run(["search"])
    run.runtime.large_result_chars = 20
    run.runtime.large_result_preview_chars = 10
    plane = ActionPlane(registry_with(handler))
    result = await plane.execute(run, ToolCall(call_id="c1", name="search", arguments={"query": "q"}))
    observation = plane.observe(run, result)
    assert result.status == ActionStatus.SUCCESS
    assert observed == {"runId": "run-test", "token": "secret-user-token", "query": "q"}
    assert observation.result_ref
    assert run.workspace.get_result(observation.result_ref) == "x" * 300
    assert observation.content == "x" * 10
    assert run.workspace.evidence[0].evidence_id == "e1"


async def test_timeout_policy_denial_and_transient_errors():
    """工具超时、策略拒绝和瞬时错误使用不同分类。"""
    async def slow(_args, _action):
        await asyncio.sleep(1)
        return ToolOutput("late")

    run = make_run(["search"])
    timeout = await ActionPlane(registry_with(slow, timeout_s=0.005)).execute(
        run,
        ToolCall(call_id="c1", name="search", arguments={"query": "q"}),
    )
    assert timeout.error_category == ActionErrorCategory.TOOL_TIMEOUT
    assert timeout.retryable

    denied = await ActionPlane(
        registry_with(slow, read_only=False),
        ReadOnlyActionPolicy(),
    ).execute(run, ToolCall(call_id="c2", name="search", arguments={"query": "q"}))
    assert denied.error_category == ActionErrorCategory.PERMISSION_DENIED

    async def unavailable(_args, _action):
        raise ToolExecutionError(ActionErrorCategory.DEPENDENCY_UNAVAILABLE, retryable=True)

    failure = await ActionPlane(registry_with(unavailable)).execute(
        run,
        ToolCall(call_id="c3", name="search", arguments={"query": "q"}),
    )
    assert failure.error_category == ActionErrorCategory.DEPENDENCY_UNAVAILABLE
    assert failure.retryable
