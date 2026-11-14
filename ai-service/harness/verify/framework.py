"""确定性验证器框架。

@author 称霸幼儿园
"""

from dataclasses import dataclass, field
from typing import Protocol

from harness.models import RunContext


@dataclass(frozen=True)
class VerificationIssue:
    """单项验证缺口。"""

    code: str
    detail: str


@dataclass(frozen=True)
class VerificationReport:
    """一次验证的汇总结果。"""

    issues: list[VerificationIssue] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        """返回是否存在验证缺口。"""
        return not self.issues


class VerificationRule(Protocol):
    """验证规则接口。"""

    def verify(self, run: RunContext) -> list[VerificationIssue]:
        """检查当前运行结果。"""


class VerifierFramework:
    """按注册顺序执行确定性规则。

    @author 称霸幼儿园
    """

    def __init__(self, rules: list[VerificationRule] | None = None):
        self._rules = rules or []

    def verify(self, run: RunContext) -> VerificationReport:
        """执行全部规则并汇总问题。

        :param run: 当前运行
        :return: 验证报告
        """
        issues = []
        for rule in self._rules:
            issues.extend(rule.verify(run))
        return VerificationReport(issues=issues)
