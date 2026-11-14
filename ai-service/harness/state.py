"""运行状态机。

@author 称霸幼儿园
"""

from harness.models import RunState


class InvalidStateTransition(RuntimeError):
    """非法状态迁移。"""


class RunStateMachine:
    """限制每次运行只能执行已定义的状态迁移。

    @author 称霸幼儿园
    """

    TRANSITIONS = {
        RunState.CREATED: {RunState.RUNNING, RunState.FAILED, RunState.CANCELLED},
        RunState.RUNNING: {
            RunState.RUNNING,
            RunState.VERIFYING,
            RunState.COMPLETED,
            RunState.FAILED,
            RunState.CANCELLED,
        },
        RunState.VERIFYING: {
            RunState.RUNNING,
            RunState.COMPLETED,
            RunState.FAILED,
            RunState.CANCELLED,
        },
        RunState.COMPLETED: set(),
        RunState.FAILED: set(),
        RunState.CANCELLED: set(),
    }

    def __init__(self, initial: RunState = RunState.CREATED):
        self.state = initial

    def transition(self, target: RunState) -> RunState:
        """迁移到目标状态。

        :param target: 目标状态
        :return: 迁移后的状态
        """
        if target not in self.TRANSITIONS[self.state]:
            raise InvalidStateTransition(f"{self.state} -> {target}")
        self.state = target
        return self.state

    @property
    def terminal(self) -> bool:
        """返回当前状态是否为终态。"""
        return not self.TRANSITIONS[self.state]
