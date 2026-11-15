"""检索层评测指标：期望证据前 k 召回率与权限泄漏数。

@author 称霸幼儿园
"""

from dataclasses import dataclass, field
from typing import Any

BASELINE_RECALL_AT_10 = 0.85
EXCLUDED_FROM_BASELINE = ("synonym",)


@dataclass
class CaseResult:
    """一道题的执行结果。

    @author 称霸幼儿园
    """

    case_id: str
    scenario: str
    returned: list[str]
    expected: list[str] = field(default_factory=list)
    forbidden: list[str] = field(default_factory=list)
    expected_count: int | None = None
    count: int | None = None
    error: str | None = None


def recall_at_k(expected: list[str], returned: list[str], k: int = 10) -> float | None:
    """计算期望证据在前 k 个结果中的召回率。

    :param expected: 期望命中的实体引用
    :param returned: 按排名返回的实体引用（可重复）
    :param k: 截断位置
    :return: 召回率；没有期望证据时为空
    """
    if not expected:
        return None
    top = list(dict.fromkeys(returned))[:k]
    return sum(1 for ref in expected if ref in top) / len(expected)


def leaks(forbidden: list[str], returned: list[str]) -> list[str]:
    """返回结果里出现的无权或越界实体。

    :param forbidden: 该身份不应看到的实体引用
    :param returned: 返回的实体引用
    :return: 泄漏的实体引用（去重、保持顺序）
    """
    return [ref for ref in dict.fromkeys(returned) if ref in forbidden]


def summarize(results: list[CaseResult], k: int = 10) -> dict[str, Any]:
    """汇总评测：基线召回率（排除同义改写题）、各场景召回、计数正确率、泄漏与报错。

    :param results: 各题结果
    :param k: 召回截断位置
    :return: 汇总报告
    """
    per_scenario: dict[str, list[float]] = {}
    baseline: list[float] = []
    leaked: list[dict[str, Any]] = []
    count_total = 0
    count_correct = 0
    errors = [result.case_id for result in results if result.error]
    for result in results:
        found = leaks(result.forbidden, result.returned)
        if found:
            leaked.append({"case": result.case_id, "refs": found})
        if result.expected_count is not None:
            count_total += 1
            count_correct += int(result.count == result.expected_count)
        recall = recall_at_k(result.expected, result.returned, k)
        if recall is None:
            continue
        per_scenario.setdefault(result.scenario, []).append(recall)
        if result.scenario not in EXCLUDED_FROM_BASELINE:
            baseline.append(recall)
    baseline_recall = sum(baseline) / len(baseline) if baseline else None
    return {
        "cases": len(results),
        "recallAtK": k,
        "baselineRecall": baseline_recall,
        "baselineTarget": BASELINE_RECALL_AT_10,
        "baselinePassed": baseline_recall is not None and baseline_recall >= BASELINE_RECALL_AT_10,
        "scenarioRecall": {name: sum(values) / len(values) for name, values in per_scenario.items()},
        "countAccuracy": count_correct / count_total if count_total else None,
        "leakCount": sum(len(item["refs"]) for item in leaked),
        "leaks": leaked,
        "errors": errors,
    }
