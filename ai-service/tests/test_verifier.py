"""验证器框架测试。

@author 称霸幼儿园
"""

from harness.verify.framework import VerificationIssue, VerifierFramework
from tests.conftest import make_run


def test_verifier_aggregates_rules_in_order():
    """验证框架按注册顺序汇总全部规则问题。"""
    class Rule:
        def __init__(self, code):
            self.code = code

        def verify(self, _run):
            return [VerificationIssue(self.code, "缺口")]

    report = VerifierFramework([Rule("A"), Rule("B")]).verify(make_run())
    assert not report.passed
    assert [issue.code for issue in report.issues] == ["A", "B"]
