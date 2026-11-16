"""大结果结构化预览的单元测试。

@author 称霸幼儿园
"""

import json

from harness.action.preview import OMITTED_HINT_KEY, OMITTED_KEY, structured_preview


def _dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def test_lists_keep_a_prefix_of_whole_items_and_metadata_stays():
    """每个对象列表从前往后保留完整条目，标量与字符串列表原样保留，并记录各列表省略的条数。"""
    results = [{"evidenceId": f"E{index}", "title": "标题" * 10} for index in range(20)]
    related = [{"ref": f"note:{index}"} for index in range(3)]
    content = _dumps({"results": results, "related": related, "total": 23, "notices": ["语义检索不可用"]})

    preview = structured_preview(content, 700)
    payload = json.loads(preview)

    assert len(preview) <= 700
    assert payload["total"] == 23
    assert payload["notices"] == ["语义检索不可用"]
    assert payload["results"] == results[: len(payload["results"])]
    assert payload["related"] == related[: len(payload["related"])]
    expected = {key: total - len(payload[key]) for key, total in (("results", 20), ("related", 3))}
    assert payload[OMITTED_KEY] == {key: count for key, count in expected.items() if count}
    assert payload[OMITTED_KEY]["results"] > 0
    assert payload[OMITTED_HINT_KEY]


def test_budget_is_filled_as_far_as_whole_items_allow():
    """再多放一条就会超出预算时才停止，不会过早截断。"""
    rows = [{"id": index, "text": "abcdefghij"} for index in range(40)]
    content = _dumps({"rows": rows, "count": 40})

    for budget in range(260, 600, 37):
        payload = json.loads(structured_preview(content, budget))
        kept = len(payload["rows"])
        payload["rows"] = rows[: kept + 1]
        payload[OMITTED_KEY] = {"rows": 40 - kept - 1}
        assert len(_dumps(payload)) > budget


def test_shrinking_a_preview_again_accumulates_omitted_counts():
    """上下文预算不足时对预览再收缩，省略条数累加，展示与省略之和仍等于原总数。"""
    rows = [{"id": index, "text": "abcdefghij"} for index in range(40)]
    first = structured_preview(_dumps({"rows": rows, "count": 40}), 600)
    second = structured_preview(first, 300)
    payload = json.loads(second)

    assert len(second) <= 300
    assert len(payload["rows"]) < len(json.loads(first)["rows"])
    assert payload["rows"] == rows[: len(payload["rows"])]
    assert payload[OMITTED_KEY] == {"rows": 40 - len(payload["rows"])}
    assert payload["count"] == 40


def test_unstructured_content_has_no_structured_preview():
    """非 JSON、顶层不是对象、没有对象列表时交还调用方按字符截取。"""
    assert structured_preview("x" * 300, 100) is None
    assert structured_preview(_dumps([{"id": index} for index in range(50)]), 100) is None
    assert structured_preview(_dumps({"text": "y" * 300, "tags": ["a"] * 30}), 100) is None


def test_metadata_alone_over_budget_or_reserved_key_falls_back():
    """元数据本身超出预算，或工具结果自己用了同名保留字段时不做结构化预览。"""
    rows = [{"id": index} for index in range(50)]
    assert structured_preview(_dumps({"note": "y" * 400, "rows": rows}), 300) is None
    assert structured_preview(_dumps({OMITTED_KEY: 1, "rows": rows}), 300) is None
    assert structured_preview(_dumps({OMITTED_KEY: {"rows": 2}, OMITTED_HINT_KEY: "别的说明", "rows": rows}), 300) is None
