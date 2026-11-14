"""中间件顺序与短路单元测试。

@author 称霸幼儿园
"""

from harness.middleware import (
    HarnessMiddleware,
    Hook,
    MiddlewareChain,
    MiddlewareContext,
    MiddlewareDecision,
)
from harness.models import RunOutcome
from tests.conftest import make_run


class Recorder(HarnessMiddleware):
    def __init__(self, name, calls, decision=None):
        self.name = name
        self.calls = calls
        self.decision = decision or MiddlewareDecision()

    async def handle(self, context: MiddlewareContext):
        self.calls.append((self.name, context.hook, context.payload))
        return self.decision


async def test_modify_then_short_circuit_preserves_order():
    """修改在后续中间件可见，短路后不再执行其余中间件。"""
    calls = []
    chain = MiddlewareChain(
        [
            Recorder("first", calls, MiddlewareDecision.modify("changed")),
            Recorder(
                "second",
                calls,
                MiddlewareDecision.short_circuit(RunOutcome.FAILED, "TEST", "停止"),
            ),
            Recorder("third", calls),
        ]
    )
    decision = await chain.invoke(Hook.BEFORE_MODEL, make_run(), "original")
    assert [item[0] for item in calls] == ["first", "second"]
    assert calls[1][2] == "changed"
    assert decision.error_category == "TEST"


async def test_state_updates_and_hints_are_committed_by_chain():
    """状态变更与追加提示由挂载链统一提交。"""
    run = make_run()
    decision = MiddlewareDecision(
        state_updates={"force_finish": True, "answer": "不可直接修改"},
        append=["补充提示"],
    )
    chain = MiddlewareChain([Recorder("policy", [], decision)])
    await chain.invoke(Hook.AFTER_ACT, run)
    assert run.force_finish is True
    assert run.answer == ""
    assert run.hints == ["补充提示"]
