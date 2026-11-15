"""真实源只读索引探针的完整性与精确清理测试。

@author 称霸幼儿园
"""

import pytest

from evals.verify_indexing import (
    EmbeddingDisabledProbeCatalog,
    cleanup_prefix_indices,
    owned_index_names,
    validate_index_documents,
)
from indexing.chunking import CHUNKER_VERSION


def test_owned_index_names_rejects_unrelated_indices_and_wildcard_names():
    """精确清理仅接受本次随机前缀的具体索引名。"""
    assert owned_index_names(["m164_probe_ab_item_v1", "m164_probe_ab_meta"], "m164_probe_ab") == [
        "m164_probe_ab_item_v1", "m164_probe_ab_meta",
    ]
    with pytest.raises(ValueError):
        owned_index_names(["kn_item_v2"], "m164_probe_ab")
    with pytest.raises(ValueError):
        owned_index_names(["m164_probe_ab_*"], "m164_probe_ab")


def test_validate_index_documents_checks_counts_generation_and_versions():
    """独立核对原始条目与分片的数量、代际和源版本。"""
    item = {
        "item_key": "note:1", "generation": "g1", "chunk_count": 1,
        "content_version": "c1", "meta_version": "m1", "readable": True,
        "chunker_version": CHUNKER_VERSION,
    }
    chunk = {**item, "chunk_index": 0}

    assert validate_index_documents({"note:1": ("c1", "m1")}, [item], [chunk]) == []
    assert validate_index_documents({"note:1": ("c1", "m1")}, [item], []) == ["chunk_count:note:1"]
    assert "chunk_generation:note:1" in validate_index_documents(
        {"note:1": ("c1", "m1")}, [item], [{**chunk, "generation": "old"}],
    )
    assert "source_version:note:1" in validate_index_documents({"note:1": ("c2", "m1")}, [item], [chunk])


def test_validate_index_documents_detects_chunk_only_orphans_and_unreadable_items():
    """独立核对报告孤儿分片和不可读条目。"""
    item = {
        "item_key": "note:1", "generation": "g1", "chunk_count": 0,
        "content_version": "c1", "meta_version": "m1", "readable": False,
        "chunker_version": CHUNKER_VERSION,
    }
    problems = validate_index_documents({"note:1": ("c1", "m1")}, [item], [{"item_key": "note:99"}])

    assert "item_unreadable:note:1" in problems
    assert "chunk_only:note:99" in problems


async def test_cleanup_prefix_indices_deletes_only_explicit_names_and_rechecks():
    """清理先列出索引，再逐个精确删除并复核剩余数量。"""
    class FakeIndices:
        names = {"m164_probe_ab_item_v1", "m164_probe_ab_meta"}

        def __init__(self):
            self.deleted = []

        async def get(self, **kwargs):
            assert kwargs["index"] == "m164_probe_ab_*"
            return {name: {} for name in self.names}

        async def delete(self, index):
            assert "*" not in index
            self.deleted.append(index)
            self.names.remove(index)

    class FakeClient:
        indices = FakeIndices()

    client = FakeClient()
    result = await cleanup_prefix_indices(client, "m164_probe_ab")

    assert result["remaining"] == 0
    assert result["remaining_indices"] == []
    assert result["deleted_indices"] == sorted(client.indices.deleted)


async def test_probe_embedding_catalog_is_explicitly_disabled():
    """正常路径探针模型快照明确停用 Embedding。"""
    snapshot = await EmbeddingDisabledProbeCatalog().snapshot()

    assert snapshot.logical_models["embedding"].enabled is False
    assert snapshot.resolve_embedding() is None
