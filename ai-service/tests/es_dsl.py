"""测试用的 Elasticsearch 查询子集求值器（bool / term / terms / regexp / range）。

@author 称霸幼儿园
"""

import re
from typing import Any


def evaluate(query: dict[str, Any], document: dict[str, Any]) -> bool:
    """判断文档是否满足查询。

    :param query: 查询 DSL
    :param document: 已索引文档的字段
    :return: 是否命中
    """
    (kind, body), = query.items()
    if kind == "bool":
        if not all(evaluate(item, document) for item in body.get("filter", [])):
            return False
        if not all(evaluate(item, document) for item in body.get("must", [])):
            return False
        if any(evaluate(item, document) for item in body.get("must_not", [])):
            return False
        should = body.get("should", [])
        if should:
            minimum = body.get("minimum_should_match", 1)
            return sum(1 for item in should if evaluate(item, document)) >= minimum
        return True
    if kind == "multi_match":
        text = str(body["query"])
        return any(text in str(document.get(name.split("^")[0]) or "") for name in body["fields"])
    (field, value), = body.items()
    actual = document.get(field)
    values = actual if isinstance(actual, list) else [actual]
    if kind == "term":
        return value in values
    if kind == "match_phrase":
        return str(value) in str(actual or "")
    if kind == "terms":
        return any(item in value for item in values)
    if kind == "regexp":
        return actual is not None and re.fullmatch(value, str(actual)) is not None
    if kind == "range":
        if actual is None:
            return False
        checks = {"gte": lambda a, b: a >= b, "gt": lambda a, b: a > b,
                  "lte": lambda a, b: a <= b, "lt": lambda a, b: a < b}
        return all(checks[op](actual, bound) for op, bound in value.items())
    raise AssertionError(f"unsupported query: {kind}")
