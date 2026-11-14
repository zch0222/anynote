"""行动身份与只读策略。

@author 称霸幼儿园
"""

from dataclasses import dataclass, field
from typing import Any

from harness.action.registry import ToolSpec
from harness.models import RunContext


@dataclass(frozen=True)
class BoundAction:
    """已绑定运行和调用身份的行动。"""

    run_id: str
    agent_version: str
    access_token: str = field(repr=False)
    tool: ToolSpec
    arguments: Any


@dataclass(frozen=True)
class PolicyDecision:
    """策略判定结果。"""

    allowed: bool
    reason: str | None = None


class ReadOnlyActionPolicy:
    """只允许 Agent 契约内的只读工具。

    @author 称霸幼儿园
    """

    def evaluate(self, run: RunContext, action: BoundAction) -> PolicyDecision:
        """判定当前运行能否执行行动。

        :param run: 当前运行
        :param action: 已绑定身份的行动
        :return: 放行或拒绝决定
        """
        if not action.tool.read_only:
            return PolicyDecision(False, "WRITE_ACTION_DISABLED")
        if action.tool.name not in run.agent.tools:
            return PolicyDecision(False, "TOOL_NOT_IN_AGENT_CONTRACT")
        if run.cancelled:
            return PolicyDecision(False, "RUN_CANCELLED")
        return PolicyDecision(True)
