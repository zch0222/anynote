"""行动面单元测试。

@author 称霸幼儿园
"""

import asyncio
import json

from pydantic import BaseModel

from harness.action.plane import ActionPlane, ToolExecutionError
from harness.action.policy import ReadOnlyActionPolicy
from harness.action.registry import ToolOutput, ToolRegistry, ToolSpec
from harness.models import ActionErrorCategory, ActionStatus, EvidenceItem, ToolCall
from tests.conftest import make_run


class SearchArgs(BaseModel):
    query: str


def registry_with(handler, read_only=True, timeout_s=None, full_result_chars=None):
    registry = ToolRegistry()
    declared = {} if full_result_chars is None else {"full_result_chars": full_result_chars}
    registry.register(
        ToolSpec(
            name="search",
            summary="搜索测试资料",
            description="测试只读工具",
            args_model=SearchArgs,
            handler=handler,
            read_only=read_only,
            timeout_s=timeout_s,
            **declared,
        )
    )
    return registry


async def _observe(plane: ActionPlane, run):
    result = await plane.execute(run, ToolCall(call_id="c1", name="search", arguments={"query": "q"}))
    return plane.observe(run, result)


async def test_oversized_json_result_keeps_metadata_and_whole_rows():
    """复现：超长 JSON 结果按字符硬切会丢掉排在后面的 count 并切断行；应保留元数据与完整的行。"""
    rows = [{"id": index, "text": "abcdefghij"} for index in range(30)]
    content = json.dumps({"rows": rows, "count": 30, "notices": ["索引落后"]}, ensure_ascii=False)

    async def handler(_args, _action):
        return ToolOutput(content)

    run = make_run(["search"])
    run.runtime.large_result_chars = 300
    run.runtime.large_result_preview_chars = 50
    observation = await _observe(ActionPlane(registry_with(handler)), run)
    payload = json.loads(observation.content)

    assert len(observation.content) <= 300
    assert payload["count"] == 30
    assert payload["notices"] == ["索引落后"]
    assert payload["rows"] and payload["rows"] == rows[: len(payload["rows"])]
    assert payload["omitted"] == {"rows": 30 - len(payload["rows"])}
    assert run.workspace.get_result(observation.result_ref) == content


async def test_declared_result_budget_and_runtime_threshold_take_the_larger():
    """工具声明的完整展示长度与运行参数取较大值，未超出时结果原样保留。"""
    async def handler(_args, _action):
        return ToolOutput("y" * 300)

    run = make_run(["search"])
    run.runtime.large_result_chars = 20
    declared = await _observe(ActionPlane(registry_with(handler, full_result_chars=1000)), run)
    run.runtime.large_result_chars = 1000
    configured = await _observe(ActionPlane(registry_with(handler, full_result_chars=10)), run)

    for observation in (declared, configured):
        assert observation.content == "y" * 300
        assert observation.result_ref is None


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
