"""只读真实源并使用隔离 Elasticsearch 前缀复验正常索引路径。

@author 称霸幼儿园
"""

import argparse
import asyncio
import json
import time
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from elasticsearch import ApiError

from clients.nacos import NacosManager
from core.config import RuntimeConfigStore, Settings
import indexing.es_store as es_store_module
from indexing.chunking import CHUNKER_VERSION
from indexing.es_store import build_es_client
from models.catalog import LogicalModelMapping, ModelCatalogSnapshot
from worker import build_pipeline, validate_internal_secret


class EmbeddingDisabledProbeCatalog:
    """为验收进程提供明确停用 Embedding 的本地快照。

    @author 称霸幼儿园
    """

    async def snapshot(self) -> ModelCatalogSnapshot:
        """返回不会发起外部模型调用的目录快照。"""
        return ModelCatalogSnapshot(
            version="m164-read-only-probe-disabled",
            logical_models={"embedding": LogicalModelMapping(enabled=False)},
        )


def owned_index_names(names: list[str], prefix: str) -> list[str]:
    """校验并排序属于本次隔离前缀的具体索引名称。"""
    if not prefix.startswith("m164_probe_") or not prefix.replace("_", "").isalnum():
        raise ValueError("invalid probe prefix")
    for name in names:
        if not name.startswith(f"{prefix}_") or any(char in name for char in "*?,"):
            raise ValueError("index name is outside probe prefix")
    return sorted(set(names))


async def cleanup_prefix_indices(client, prefix: str) -> dict[str, Any]:
    """只删除本轮枚举出的具体索引名并再次读取剩余索引。"""
    owned_index_names([], prefix)
    response = await client.indices.get(index=f"{prefix}_*", allow_no_indices=True, ignore_unavailable=True)
    names = owned_index_names(list(response), prefix)
    for name in names:
        await client.indices.delete(index=name)
    remaining_response = await client.indices.get(
        index=f"{prefix}_*", allow_no_indices=True, ignore_unavailable=True,
    )
    remaining = owned_index_names(list(remaining_response), prefix)
    return {"deleted_indices": names, "remaining_indices": remaining, "remaining": len(remaining)}


def validate_index_documents(
    expected: dict[str, tuple[str, str]],
    items: list[dict[str, Any]],
    chunks: list[dict[str, Any]],
) -> list[str]:
    """独立核对原始源版本、条目分片数、代际和可读状态。"""
    problems: list[str] = []
    item_map = {str(item.get("item_key") or ""): item for item in items}
    chunk_map: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for chunk in chunks:
        chunk_map[str(chunk.get("item_key") or "")].append(chunk)
    for key in sorted(set(expected) - set(item_map)):
        problems.append(f"missing_item:{key}")
    for key in sorted(set(item_map) - set(expected)):
        problems.append(f"item_only:{key}")
    for key in sorted(set(chunk_map) - set(item_map)):
        problems.append(f"chunk_only:{key}")
    for key, item in item_map.items():
        if expected.get(key) != (item.get("content_version") or "", item.get("meta_version") or ""):
            problems.append(f"source_version:{key}")
        if item.get("readable") is not True:
            problems.append(f"item_unreadable:{key}")
        if item.get("chunker_version") != CHUNKER_VERSION:
            problems.append(f"item_chunker_version:{key}")
        actual_chunks = chunk_map.get(key, [])
        if len(actual_chunks) != item.get("chunk_count"):
            problems.append(f"chunk_count:{key}")
        for chunk in actual_chunks:
            if chunk.get("generation") != item.get("generation"):
                problems.append(f"chunk_generation:{key}")
            if chunk.get("readable") is not True:
                problems.append(f"chunk_unreadable:{key}")
            if chunk.get("chunker_version") != CHUNKER_VERSION:
                problems.append(f"chunk_version:{key}")
            if (chunk.get("content_version"), chunk.get("meta_version")) != (
                item.get("content_version"), item.get("meta_version"),
            ):
                problems.append(f"chunk_source_version:{key}")
    return sorted(set(problems))


async def _scan_documents(client, index: str) -> list[dict[str, Any]]:
    """分页读取独立完整性核对所需的非正文索引字段。"""
    fields = [
        "item_key", "entity_type", "generation", "chunk_count", "chunker_version",
        "content_version", "meta_version", "readable", "chunk_index", "index_status",
    ]
    response = await client.search(index=index, query={"match_all": {}}, size=500, sort=["_doc"], scroll="1m", _source=fields)
    documents = []
    scroll_id = response.get("_scroll_id")
    try:
        while True:
            hits = response.get("hits", {}).get("hits", [])
            if not hits:
                break
            documents.extend(hit.get("_source") or {} for hit in hits)
            if not scroll_id:
                break
            response = await client.scroll(scroll_id=scroll_id, scroll="1m")
            scroll_id = response.get("_scroll_id", scroll_id)
    finally:
        if scroll_id:
            await client.clear_scroll(scroll_id=scroll_id)
    return documents


async def _primary_aliases(client) -> dict[str, Any]:
    """读取业务索引别名用于前后不变断言。"""
    try:
        response = await client.indices.get_alias(name="kn_item,kn_chunk", allow_no_indices=True, ignore_unavailable=True)
    except ApiError as error:
        if error.status_code == 404:
            return {}
        raise
    return dict(response)


async def run_probe(code_ref: str, settings: Settings | None = None) -> dict[str, Any]:
    """执行隔离重建、增量水位、两轮对账和精确索引清理。"""
    prefix = f"m164_probe_{uuid4().hex[:12]}"
    cfg = (settings or Settings()).model_copy(update={
        "HOST": prefix.replace("_", "-"),
        "NACOS_SERVICE_NAME": "anynote-ai-indexer-probe",
    })
    validate_internal_secret(cfg)
    result: dict[str, Any] = {
        "code_ref": code_ref,
        "started_at": datetime.now(UTC).isoformat(),
        "prefix": prefix,
        "scope": "existing-real-source-read-only-normal-path",
        "fixed_nine_entity_corpus": False,
        "embedding": "explicitly_disabled_for_probe",
        "durations_s": {},
        "assertions": [],
        "status_write_attempts": [],
        "passed": False,
    }
    started = time.monotonic()
    runtime_store = RuntimeConfigStore(cfg.runtime_defaults())
    nacos = NacosManager(cfg, runtime_store)
    store = None
    independent_client = None
    original_aliases = (es_store_module.ITEM_ALIAS, es_store_module.CHUNK_ALIAS, es_store_module.META_INDEX)
    primary_before = None
    try:
        await nacos.start()
        independent_client = build_es_client(cfg, runtime_store.get().indexer)
        primary_before = await _primary_aliases(independent_client)
        es_store_module.ITEM_ALIAS = f"{prefix}_item"
        es_store_module.CHUNK_ALIAS = f"{prefix}_chunk"
        es_store_module.META_INDEX = f"{prefix}_meta"
        pipeline, store = await build_pipeline(cfg, runtime_store)
        pipeline._model_providers = EmbeddingDisabledProbeCatalog()

        async def record_status(doc_id: int, status: int) -> None:
            """记录资料索引状态回写意图并阻止真实回写。"""
            result["status_write_attempts"].append({"doc_id": doc_id, "status": status})

        pipeline._knowledge.update_doc_index_status = record_status
        phase_start = time.monotonic()
        result["rebuilt_documents"] = await pipeline.run_rebuild()
        result["durations_s"]["rebuild"] = round(time.monotonic() - phase_start, 6)
        phase_start = time.monotonic()
        result["incremental_changes"] = await pipeline.run_incremental()
        result["durations_s"]["incremental"] = round(time.monotonic() - phase_start, 6)
        phase_start = time.monotonic()
        result["first_reconcile"] = await pipeline.run_reconcile()
        result["durations_s"]["first_reconcile"] = round(time.monotonic() - phase_start, 6)
        phase_start = time.monotonic()
        result["second_reconcile"] = await pipeline.run_reconcile()
        result["durations_s"]["second_reconcile"] = round(time.monotonic() - phase_start, 6)
        active = await store.get_active_meta()
        if active is None:
            raise RuntimeError("probe active metadata missing")
        result["active_metadata"] = active
        result["watermark"] = await store.get_watermark()
        result["processed_cursor"] = await store.get_cursor()
        source_page = await pipeline._knowledge.changes(after_id=0, limit=1)
        result["source_latest_cursor"] = source_page.latest_cursor
        expected: dict[str, tuple[str, str]] = {}
        source_counts: Counter[str] = Counter()
        async for documents in pipeline._adapter.iter_export(page_size=pipeline._runtime.batch_size):
            for document in documents:
                expected[document.canonical_key] = (document.content_version or "", document.meta_version or "")
                source_counts[document.entity_type] += 1
        result["source_entity_counts"] = dict(sorted(source_counts.items()))
        item_documents = await _scan_documents(independent_client, active["item_index"])
        chunk_documents = await _scan_documents(independent_client, active["chunk_index"])
        item_count = int((await independent_client.count(index=active["item_index"]))["count"])
        chunk_count = int((await independent_client.count(index=active["chunk_index"]))["count"])
        result["independent_counts"] = {"items": item_count, "chunks": chunk_count}
        result["integrity_errors"] = validate_index_documents(expected, item_documents, chunk_documents)
        mutations = {"indexed", "meta_updated", "deleted", "failed", "unextractable"}
        result["assertions"].extend([
            {"name": "independent_source_item_count", "passed": item_count == len(expected)},
            {"name": "independent_item_scan_count", "passed": item_count == len(item_documents)},
            {"name": "independent_chunk_scan_count", "passed": chunk_count == len(chunk_documents)},
            {"name": "independent_source_item_chunk_integrity", "passed": not result["integrity_errors"]},
            {"name": "second_reconcile_zero_mutation", "passed": all(result["second_reconcile"].get(key, 0) == 0 for key in mutations)},
            {"name": "cursor_caught_up", "passed": result["processed_cursor"] == source_page.latest_cursor},
        ])
    except Exception as error:
        result["error_type"] = type(error).__name__
    finally:
        if independent_client is not None:
            try:
                result["cleanup"] = await cleanup_prefix_indices(independent_client, prefix)
                primary_after = await _primary_aliases(independent_client)
                result["assertions"].append({"name": "primary_aliases_unchanged", "passed": primary_before == primary_after})
                result["assertions"].append({"name": "temporary_indices_zero", "passed": result["cleanup"]["remaining"] == 0})
            except Exception as error:
                result["cleanup_error_type"] = type(error).__name__
        es_store_module.ITEM_ALIAS, es_store_module.CHUNK_ALIAS, es_store_module.META_INDEX = original_aliases
        if store is not None:
            await store.close()
        if independent_client is not None:
            await independent_client.close()
        await nacos.close()
        result["ended_at"] = datetime.now(UTC).isoformat()
        result["durations_s"]["total"] = round(time.monotonic() - started, 6)
    result["passed"] = (
        "error_type" not in result
        and "cleanup_error_type" not in result
        and bool(result["assertions"])
        and all(assertion["passed"] for assertion in result["assertions"])
    )
    return result


async def main_async(args: argparse.Namespace) -> None:
    """保存探针原始结果，并用退出码表示所有断言是否通过。"""
    result = await run_probe(args.code_ref)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "passed": result["passed"], "cleanup": result.get("cleanup")}, ensure_ascii=False))
    if not result["passed"]:
        raise SystemExit(1)


def main() -> None:
    """解析只读真实源验收命令。"""
    parser = argparse.ArgumentParser(description="M16.4 只读真实源正常路径探针")
    parser.add_argument("--output", required=True)
    parser.add_argument("--code-ref", required=True)
    asyncio.run(main_async(parser.parse_args()))


if __name__ == "__main__":
    main()
