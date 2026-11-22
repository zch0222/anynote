"""检索层评测运行器：以各身份执行 kb_search / kb_query，统计前十召回率与权限泄漏，不调用对话模型。

用法（在 compose 网络内、索引已包含种子数据后执行）::

    python -m evals.run_retrieval --seed evals/output/seed.json --report evals/output/report.json

@author 称霸幼儿园
"""

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

import httpx

from clients.file import FileClient
from clients.knowledge import KnowledgeClient
from clients.model_provider import ModelProviderClient
from core.config import HarnessRuntimeSettings, IndexerRuntimeSettings, get_settings
from evals.metrics import CaseResult, summarize
from evals.seed import login
from harness.action.plane import ActionPlane, FatalActionError
from harness.action.registry import ToolRegistry
from harness.models import AgentDefinition, RunContext, RunRequest, RunScope, ToolCall
from indexing.es_store import build_es_client
from models.openai_compatible import OpenAICompatibleAdapter
from retrieval.index_reader import KnowledgeIndexReader
from retrieval.search import HybridSearcher
from retrieval.session import RetrievalSessionStore
from tools.knowledge import KNOWLEDGE_TOOL_NAMES, register_knowledge_tools
from tools.knowledge.common import KnowledgeToolContext

TOP_K = 10


def resolve_case(case: dict[str, Any], seed: dict[str, Any]) -> tuple[RunScope | None, dict[str, Any]]:
    """把用例里的语料键换成实际的知识库 id 与实体引用。

    :param case: 数据集中的一题
    :param seed: 种子文件内容
    :return: （运行范围, 工具参数）
    """
    kb_ids = seed["kbIds"]
    scope = None
    if case.get("scope"):
        scope = RunScope(knowledgeBaseIds=[kb_ids[key] for key in case["scope"].get("knowledgeBaseIds", [])],
                         refs=[seed["refs"][key] for key in case["scope"].get("refs", [])])
    if case["tool"] == "kb_search":
        arguments = {"query": case["input"], "limit": TOP_K}
    else:
        arguments = dict(case["arguments"])
        if "kb_ids" in arguments:
            arguments["kb_ids"] = [kb_ids[key] for key in arguments["kb_ids"]]
    return scope, arguments


def returned_keys(payload: dict[str, Any], tool: str, ref_to_key: dict[str, str]) -> list[str]:
    """把工具结果里的实体引用映射回语料键，非语料实体保留原引用。

    :param payload: 工具返回的 JSON
    :param tool: 工具名
    :param ref_to_key: 引用到语料键的映射
    :return: 按排名的语料键
    """
    rows = payload.get("results") if tool == "kb_search" else payload.get("rows")
    return [ref_to_key.get(row["ref"], row["ref"]) for row in rows or []]


async def run(seed_path: Path, dataset_path: Path, gateway: str) -> dict[str, Any]:
    """执行全部用例并汇总。

    :param seed_path: 种子文件
    :param dataset_path: 数据集文件
    :param gateway: 网关地址（用于以评测身份登录）
    :return: 汇总报告与逐题结果
    """
    settings = get_settings()
    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    cases = [json.loads(line) for line in dataset_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    ref_to_key = {ref: key for key, ref in seed["refs"].items()}
    snapshot = await ModelProviderClient(settings).snapshot()
    es = build_es_client(settings, IndexerRuntimeSettings())
    store = RetrievalSessionStore(KnowledgeClient(settings), KnowledgeIndexReader(es))
    registry = ToolRegistry()
    register_knowledge_tools(registry, KnowledgeToolContext(
        store=store,
        searcher=HybridSearcher(OpenAICompatibleAdapter()),
        file_client=FileClient(settings),
    ))
    plane = ActionPlane(registry)
    agent = AgentDefinition(name="retrieval-eval", version="1", goal="检索层评测", instructions="",
                            tools=list(KNOWLEDGE_TOOL_NAMES))
    tokens: dict[str, str] = {}
    results: list[CaseResult] = []
    try:
        async with httpx.AsyncClient(base_url=gateway, timeout=30.0) as client:
            for persona, account in seed["personas"].items():
                tokens[persona] = await login(client, account["username"], account["password"])
        for case in cases:
            scope, arguments = resolve_case(case, seed)
            run_id = f"eval-{case['id']}"
            context = RunContext(request=RunRequest(runId=run_id, input=case.get("input") or case["id"], scope=scope),
                                 agent=agent, runtime=HarnessRuntimeSettings(), model_snapshot=snapshot,
                                 access_token=tokens[case["persona"]])
            result = CaseResult(case_id=case["id"], scenario=case["scenario"], returned=[],
                                expected=case.get("expected", []), forbidden=case.get("forbidden", []),
                                expected_count=case.get("expectedCount"))
            try:
                action = await plane.execute(context, ToolCall(call_id=run_id, name=case["tool"], arguments=arguments))
                if action.error_category is not None:
                    result.error = f"{action.error_category.value}: {action.content}"
                else:
                    payload = json.loads(action.content)
                    result.returned = returned_keys(payload, case["tool"], ref_to_key)
                    result.count = payload.get("count")
            except FatalActionError as error:
                result.error = error.category
            finally:
                store.release(run_id)
            results.append(result)
    finally:
        await es.close()
    report = summarize(results, TOP_K)
    report["details"] = [result.__dict__ for result in results]
    return report


def main() -> None:
    """命令行入口。"""
    parser = argparse.ArgumentParser(description="M16.5 检索层评测")
    parser.add_argument("--seed", default="evals/output/seed.json")
    parser.add_argument("--dataset", default="evals/datasets/retrieval_v1.jsonl")
    parser.add_argument("--gateway", default="http://anynote-gateway:8080")
    parser.add_argument("--report", default="evals/output/report.json")
    args = parser.parse_args()
    report = asyncio.run(run(Path(args.seed), Path(args.dataset), args.gateway))
    Path(args.report).parent.mkdir(parents=True, exist_ok=True)
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "details"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
