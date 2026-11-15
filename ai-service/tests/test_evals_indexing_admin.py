"""固定九类索引验收的资源安全与隔离辅助测试。

@author 称霸幼儿园
"""

import fnmatch
import json

from evals.indexing_admin import (
    DeterministicEmbeddingAdapter,
    FixtureDatabase,
    FixtureSourceAdapter,
    build_cleanup_plan,
    cleanup_fixture_tokens,
    cleanup_verified,
    legacy_document_owned,
    validate_fixture_object_names,
)
from evals.run_indexing import FixtureManifest
from indexing.models import SourceDocument
from models.catalog import LogicalModelMapping, ModelCatalogSnapshot, ProviderSnapshot


def _manifest() -> FixtureManifest:
    """构造包含九类实体及清理主键的固定清单。"""
    manifest = FixtureManifest(prefix="m164fixture", corpus_version=1, username="m164user", user_id=42, kb_id=7, mooc_id=8)
    manifest.refs = {
        "kb": "kb:7", "note": "note:2", "doc_text": "doc:3", "mooc": "mooc:8",
        "mooc_item": "mooc_item:9", "video": "mooc_item:10",
        "transcript": "mooc_item:10#transcript", "summary": "mooc_item:10#summary",
        "task": "task:11", "notice": "notice:12",
    }
    manifest.row_ids = {
        "n_note_text": [20], "n_note_operation_log": [21], "n_note_edit_log": [22],
        "n_note_history": [23], "n_doc": [3], "f_file": [30],
        "a_mooc_video_summarize": [40], "n_mooc_video_item_info": [41],
        "n_mooc_item_text": [42], "n_note_task_operation_history": [50],
        "n_knowledge_change": [60, 61],
    }
    manifest.file_ids = [30]
    return manifest


def test_cleanup_plan_uses_parameters_and_manifest_owned_ids():
    """物理清理使用参数化 SQL，并限定清单中的资源主键与归属。"""
    plan = build_cleanup_plan(_manifest())
    statements = {statement[0].split()[2]: statement for statement in plan}

    assert statements["sys_user"][1] == (42, "m164user")
    assert statements["n_knowledge_change"][1] == (60, 61)
    assert statements["n_note"][1] == (2, 7, 42)
    assert statements["n_mooc"][1] == (8, 7, 42)
    assert statements["ntc_notice"] == ("DELETE FROM ntc_notice WHERE id=%s", (12,))
    assert all("m164user" not in sql for sql, _params in plan)
    assert all("m164fixture" not in sql for sql, _params in plan)


def test_legacy_document_ownership_requires_all_fixture_markers():
    """共享旧索引文档必须同时匹配 ID、知识库、创建者与固定前缀。"""
    source = {"id": 2, "knowledgeBaseId": 7, "createBy": 42, "title": "m164fixture_note"}

    assert legacy_document_owned(source, _manifest(), 2) is True
    assert legacy_document_owned({**source, "knowledgeBaseId": 8}, _manifest(), 2) is False
    assert legacy_document_owned({**source, "createBy": 9}, _manifest(), 2) is False
    assert legacy_document_owned({**source, "title": "other"}, _manifest(), 2) is False
    assert legacy_document_owned(source, _manifest(), 3) is False


def test_object_cleanup_rejects_names_outside_fixture_prefix():
    """对象清理拒绝不含本次固定前缀的路径。"""
    validate_fixture_object_names(["doc/m164fixture_a.pdf"], "m164fixture")

    try:
        validate_fixture_object_names(["doc/other.pdf"], "m164fixture")
    except ValueError:
        pass
    else:
        raise AssertionError


def test_cleanup_verified_requires_every_channel_to_be_empty():
    """只有数据库、对象、令牌、旧索引和隔离索引全部清零才算清理成功。"""
    assert cleanup_verified({"database": {}, "objects": [], "tokens": 0, "legacy": [], "indices": 0}) is True
    assert cleanup_verified({"database": {"n_note": 1}, "objects": [], "tokens": 0, "legacy": [], "indices": 0}) is False
    assert cleanup_verified({"database": {}, "objects": ["missing"], "tokens": 0, "legacy": [], "indices": 0}) is False
    assert cleanup_verified({"database": {}, "objects": [], "tokens": 1, "legacy": [], "indices": 0}) is False


async def test_fixture_source_adapter_filters_unrelated_incremental_refs():
    """固定语料增量适配器不读取或删除其他知识库实体。"""
    calls = []

    class FakeAdapter:
        async def fetch_by_refs(self, refs):
            calls.append(refs)
            return [SourceDocument(ref=refs[0], entity_type="note", entity_id=2, kb_id=7)], []

        async def iter_export(self, **kwargs):
            calls.append(kwargs)
            yield []

    adapter = FixtureSourceAdapter(FakeAdapter(), _manifest())
    documents, missing = await adapter.fetch_by_refs(["note:2", "note:999"])
    async for _documents in adapter.iter_export(page_size=50):
        pass

    assert [document.ref for document in documents] == ["note:2"]
    assert missing == []
    assert calls[0] == ["note:2"]
    assert calls[1]["page_size"] == 50 and calls[1]["kb_id"] == 7


async def test_deterministic_embedding_records_inputs_without_network():
    """确定性向量替身保留输入断言且维度固定。"""
    snapshot = ModelCatalogSnapshot(
        version="fixture",
        providers=[ProviderSnapshot(
            providerKey="local", displayName="local", protocol="openai_compatible", baseUrl="http://localhost",
            apiKey="unused", models=[], dataEgressAllowed=True, enabled=True,
        )],
        logicalModels={"embedding": LogicalModelMapping(provider="local", model="fixture", enabled=True, dimensions=8)},
    )
    adapter = DeterministicEmbeddingAdapter()

    vectors = await adapter.embed(snapshot, ["标题：标题\n标题路径：路径\n正文：正文"])

    assert adapter.embed_calls == [["标题：标题\n标题路径：路径\n正文：正文"]]
    assert len(vectors) == 1 and len(vectors[0]) == 8
    assert vectors[0] == (await adapter.embed(snapshot, ["标题：标题\n标题路径：路径\n正文：正文"]))[0]


async def test_token_cleanup_deletes_only_temporary_username_keys():
    """令牌清理仅删除临时用户的访问与刷新令牌。"""
    class FakeRedis:
        def __init__(self):
            self.keys = {"{m164user}_{ACCESS_TOKEN}_a", "{m164user}_{REFRESH_TOKEN}_b", "{other}_{ACCESS_TOKEN}_c"}

        async def scan_iter(self, match):
            for key in list(self.keys):
                if fnmatch.fnmatchcase(key, match):
                    yield key

        async def delete(self, key):
            self.keys.remove(key)

    redis = FakeRedis()

    assert await cleanup_fixture_tokens(redis, "m164user") == 0
    assert redis.keys == {"{other}_{ACCESS_TOKEN}_c"}


class _FakeCursor:
    def __init__(self, connection):
        self.connection = connection

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def execute(self, sql, params):
        self.connection.calls.append((sql, params))
        if sql.startswith("SELECT id FROM n_mooc_video_item_info"):
            self._row = {"id": 41}
        elif sql.startswith("SELECT mi.id"):
            self._row = {"id": 10, "mooc_id": 8}
        else:
            self._row = None
        return 1

    def fetchone(self):
        return self._row

    @property
    def lastrowid(self):
        return 40


class _FakeConnection:
    def __init__(self):
        self.calls = []
        self.committed = False

    def cursor(self):
        return _FakeCursor(self)

    def commit(self):
        self.committed = True

    def rollback(self):
        pass


def test_supplement_video_updates_owned_info_and_inserts_fixed_summary():
    """字幕补种校验慕课归属，并在同一事务记录固定总结及资源 ID。"""
    connection = _FakeConnection()
    database = FixtureDatabase(lambda: connection)
    manifest = _manifest()

    database.supplement_video(manifest, "mooc/m164fixture.srt", "固定总结")

    assert connection.committed is True
    assert manifest.row_ids["a_mooc_video_summarize"] == [40]
    assert manifest.row_ids["n_mooc_video_item_info"] == [41]
    assert manifest.refs["transcript"] == "mooc_item:10#transcript"
    assert manifest.refs["summary"] == "mooc_item:10#summary"
    assert any(sql.startswith("UPDATE n_mooc_video_item_info") and params[:3] == (
        "mooc/m164fixture.srt", 42, 10,
    ) for sql, params in connection.calls)
    assert any(sql.startswith("INSERT INTO a_mooc_video_summarize") and params[2:4] == (
        "固定总结", "m164-deterministic-fixture",
    ) for sql, params in connection.calls)


def test_fixture_manifest_does_not_serialize_admin_credentials():
    """验收清单不序列化数据库或对象存储凭据。"""
    payload = json.loads(json.dumps(_manifest().__dict__))

    assert not {"password", "access_key", "secret_key"} & payload.keys()
