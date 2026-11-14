"""状态机单元测试。

@author 称霸幼儿园
"""

import pytest

from harness.models import RunState
from harness.state import InvalidStateTransition, RunStateMachine


def test_normal_and_cancelled_transitions():
    """正常完成与取消路径均遵守状态迁移表。"""
    normal = RunStateMachine()
    normal.transition(RunState.RUNNING)
    normal.transition(RunState.VERIFYING)
    normal.transition(RunState.COMPLETED)
    assert normal.terminal

    cancelled = RunStateMachine()
    cancelled.transition(RunState.RUNNING)
    cancelled.transition(RunState.CANCELLED)
    assert cancelled.terminal


def test_terminal_and_invalid_transitions_are_rejected():
    """终态和未定义迁移抛出明确异常。"""
    machine = RunStateMachine()
    with pytest.raises(InvalidStateTransition):
        machine.transition(RunState.COMPLETED)
    machine.transition(RunState.FAILED)
    with pytest.raises(InvalidStateTransition):
        machine.transition(RunState.RUNNING)
