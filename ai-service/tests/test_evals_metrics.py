"""检索层评测指标与用例解析单元测试（不连接运行中的栈）。

@author 称霸幼儿园
"""

import json
from pathlib import Path

from evals.metrics import BASELINE_RECALL_AT_10, CaseResult, leaks, recall_at_k, summarize
from evals.run_retrieval import resolve_case, returned_keys

EVALS = Path(__file__).resolve().parents[1] / "evals"


def test_recall_at_k_dedupes_and_truncates():
    """重复引用只算一次，只看前 k 个，没有期望证据时为空。"""
    assert recall_at_k(["a", "b"], ["a", "a", "x", "b"], k=2) == 0.5
    assert recall_at_k(["a"], [f"x{index}" for index in range(10)] + ["a"], k=10) == 0.0
    assert recall_at_k([], ["a"]) is None


def test_leaks_reports_forbidden_refs_once():
    """无权实体出现即计为泄漏，重复只记一次。"""
    assert leaks(["secret"], ["ok", "secret", "secret"]) == ["secret"]
    assert leaks(["secret"], ["ok"]) == []


def test_summary_excludes_synonym_from_baseline_and_counts_leaks():
    """基线召回排除同义改写题；计数题按 count 判对错；泄漏与报错单列。"""
    results = [
        CaseResult("k1", "keyword", ["a"], expected=["a"]),
        CaseResult("k2", "keyword", ["x"], expected=["b"]),
        CaseResult("s1", "synonym", [], expected=["c"]),
        CaseResult("n1", "permission_negative", ["secret"], forbidden=["secret"]),
        CaseResult("q1", "list_count", [], expected_count=3, count=3),
        CaseResult("e1", "keyword", [], expected=["d"], error="DEPENDENCY_UNAVAILABLE"),
    ]
    report = summarize(results)
    assert report["baselineRecall"] == 1 / 3
    assert report["baselinePassed"] is False
    assert report["baselineTarget"] == BASELINE_RECALL_AT_10
    assert report["scenarioRecall"]["synonym"] == 0.0
    assert report["countAccuracy"] == 1.0
    assert report["leakCount"] == 1
    assert report["errors"] == ["e1"]


def test_dataset_references_only_corpus_keys():
    """数据集里引用的语料键都在语料定义中，用例字段完整。"""
    corpus = json.loads((EVALS / "corpus_v1.json").read_text(encoding="utf-8"))
    keys = {item["key"] for group in ("knowledgeBases", "notes", "tasks") for item in corpus[group]}
    cases = [json.loads(line) for line in (EVALS / "datasets/retrieval_v1.jsonl").read_text(encoding="utf-8").splitlines()
             if line.strip()]
    assert len(cases) >= 20
    assert {case["scenario"] for case in cases} >= {"keyword", "no_answer", "permission_negative", "list_count"}
    for case in cases:
        assert case["persona"] in corpus["personas"]
        assert set(case.get("expected", [])) <= keys
        assert set(case.get("forbidden", [])) <= keys
        assert set((case.get("scope") or {}).get("knowledgeBaseIds", [])) <= keys


def test_resolve_case_and_map_results_back_to_keys():
    """用例的语料键换成实际 id，结果引用映射回语料键。"""
    seed = {"kbIds": {"kb_main": 55}, "refs": {"kb_main": "kb:55", "a_note": "note:9"}}
    scope, arguments = resolve_case({"tool": "kb_search", "input": "q", "scope": {"knowledgeBaseIds": ["kb_main"]}},
                                    seed)
    assert scope.knowledge_base_ids == [55]
    assert arguments == {"query": "q", "limit": 10}
    _scope, query_args = resolve_case({"tool": "kb_query", "arguments": {"entity": "note", "kb_ids": ["kb_main"]}},
                                      seed)
    assert query_args["kb_ids"] == [55]
    keys = returned_keys({"results": [{"ref": "note:9"}, {"ref": "note:1"}]}, "kb_search", {"note:9": "a_note"})
    assert keys == ["a_note", "note:1"]
