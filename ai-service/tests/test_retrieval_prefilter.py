"""第一段预过滤口径：读取与 Java 共享的权限矩阵逐条校验。

@author 称霸幼儿园
"""

import json
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from harness.models import RunScope
from retrieval.index_reader import KnowledgeIndexReader
from retrieval.models import KnowledgeScope, ScopeKnowledgeBase
from retrieval.prefilter import build_access_filter, build_narrowing_filter, build_prefilter
from tests.es_dsl import evaluate

MATRIX_PATH = (
    Path(__file__).resolve().parents[2] / "services/note/src/test/resources/knowledge/access-matrix.json"
)
ROLE_USER_IDS = {"AUTHOR": 7, "KB_MANAGER": 8, "EDITOR": 9, "READER": 10, "DISABLED_MEMBER": 11, "ADMIN": 12}
ROLE_NAMES = {1: "MANAGE", 2: "EDIT", 3: "READ"}
KB_ID = 55


def _load_cases() -> list[dict]:
    assert MATRIX_PATH.is_file(), f"权限矩阵不存在：{MATRIX_PATH}"
    return json.loads(MATRIX_PATH.read_text(encoding="utf-8"))["cases"]


CASES = _load_cases()


def _document(case: dict) -> dict:
    user_id = ROLE_USER_IDS.get(case["role"], 13)
    task_permission = case.get("taskPermission")
    return {
        "entity_type": case["entityType"],
        "kb_id": KB_ID,
        "create_by": 7 if case["role"] == "AUTHOR" else 77,
        "permissions": case.get("permissions"),
        "data_scope": case.get("dataScope"),
        "task_member_ids": [user_id] if task_permission in (1, 2) else [],
    }


def _scope(case: dict, explicit: bool) -> KnowledgeScope:
    """按 note `/scope` 的实现构造该角色的检索范围。"""
    role = case["role"]
    admin = role == "ADMIN"
    kb_permission = case.get("kbPermission")
    bases = []
    if kb_permission is not None and kb_permission <= 3:
        bases.append(ScopeKnowledgeBase(kbId=KB_ID, name="库", role=ROLE_NAMES[kb_permission],
                                        permissions=kb_permission, explicit=explicit))
    elif explicit and admin:
        bases.append(ScopeKnowledgeBase(kbId=KB_ID, name="库", role="ADMIN", permissions=1, explicit=True))
    return KnowledgeScope(userId=ROLE_USER_IDS.get(role, 13), admin=admin, defaultScope=not explicit,
                          knowledgeBases=bases)


@pytest.mark.parametrize("case", [case for case in CASES if case["role"] != "ANONYMOUS"], ids=lambda c: c["id"])
def test_explicit_scope_prefilter_matches_matrix(case):
    """显式指定该知识库时，预过滤结论与矩阵 expectedReadable 完全一致。"""
    access = build_access_filter(_scope(case, explicit=True))
    assert evaluate(access, _document(case)) is case["expectedReadable"]


@pytest.mark.parametrize("case", [case for case in CASES if case["role"] != "ANONYMOUS"], ids=lambda c: c["id"])
def test_default_scope_prefilter_matches_matrix_except_admin_power(case):
    """默认范围下与矩阵一致；超管非成员时按 D16 不可见。"""
    access = build_access_filter(_scope(case, explicit=False))
    expected = case["expectedReadable"]
    if case["role"] == "ADMIN" and case.get("kbPermission") is None:
        expected = False
    assert evaluate(access, _document(case)) is expected


def test_matrix_covers_every_entity_type_and_role():
    """矩阵覆盖六种实体与各角色，防止共享用例被删减后测试悄悄变弱。"""
    entity_types = {case["entityType"] for case in CASES}
    roles = {case["role"] for case in CASES}
    assert entity_types == {"note", "doc", "mooc", "kb", "task"}
    assert {"AUTHOR", "KB_MANAGER", "EDITOR", "READER", "NON_MEMBER", "ADMIN"} <= roles


def test_admin_default_scope_uses_ordinary_rules_in_joined_kb():
    """超管默认范围内的已加入库按普通成员口径：他人私有笔记不可见。"""
    scope = KnowledgeScope(userId=12, admin=True, defaultScope=True, knowledgeBases=[
        ScopeKnowledgeBase(kbId=KB_ID, role="READ", permissions=3, explicit=False)])
    private_note = {"entity_type": "note", "kb_id": KB_ID, "create_by": 77, "permissions": "70000", "data_scope": 1}
    assert evaluate(build_access_filter(scope), private_note) is False


def test_note_member_clause_excludes_author_using_other_slot():
    """作者兼成员时笔记只看作者位，成员位可读不放行。"""
    scope = KnowledgeScope(userId=7, knowledgeBases=[ScopeKnowledgeBase(kbId=KB_ID, role="MANAGE", permissions=1)])
    note = {"entity_type": "note", "kb_id": KB_ID, "create_by": 7, "permissions": "07000", "data_scope": 2}
    assert evaluate(build_access_filter(scope), note) is False


def test_unarchived_note_matches_only_author():
    """未归档笔记只匹配作者本人。"""
    scope = KnowledgeScope(userId=7, knowledgeBases=[])
    own = {"entity_type": "note", "kb_id": 0, "create_by": 7, "permissions": "70000", "data_scope": 1}
    other = {**own, "create_by": 8}
    assert evaluate(build_access_filter(scope), own) is True
    assert evaluate(build_access_filter(scope), other) is False


def test_prefilter_excludes_notice_and_applies_narrowing():
    """预过滤排除通知，显式范围按知识库或实体引用之一收窄。"""
    scope = KnowledgeScope(userId=7, knowledgeBases=[ScopeKnowledgeBase(kbId=KB_ID, role="READ", permissions=3)])
    filters = build_prefilter(scope, RunScope(knowledgeBaseIds=[KB_ID], refs=["note:5"]))
    query = {"bool": {"filter": filters}}
    notice = {"entity_type": "notice", "kb_id": KB_ID, "create_by": 7, "permissions": "77400", "data_scope": 3}
    in_kb = {"entity_type": "doc", "kb_id": KB_ID, "create_by": 77, "permissions": "00400", "data_scope": 3,
             "ref": "doc:1", "readable": True}
    own_elsewhere = {"entity_type": "note", "kb_id": 66, "create_by": 7, "permissions": "70000",
                     "data_scope": 1, "ref": "note:9", "readable": True}
    own_listed = {**own_elsewhere, "ref": "note:5"}
    assert evaluate(query, notice) is False
    assert evaluate(query, in_kb) is True
    assert evaluate(query, own_elsewhere) is False
    assert evaluate(query, own_listed) is True


def test_default_run_scope_has_no_narrowing():
    """默认范围不生成收窄条件。"""
    assert build_narrowing_filter(None) is None
    assert build_narrowing_filter(RunScope()) is None


@pytest.mark.parametrize("readable", [True, False, None])
def test_prefilter_requires_readable_transition_state(readable):
    """预过滤仅放行显式可读的索引记录。

    @author 称霸幼儿园
    """
    scope = KnowledgeScope(userId=7)
    document = {"entity_type": "note", "create_by": 7, "permissions": "70000"}
    if readable is not None:
        document["readable"] = readable
    query = {"bool": {"filter": build_prefilter(scope, None)}}
    assert evaluate(query, document) is (readable is True)


@pytest.mark.parametrize("operation", [
    "lexical", "semantic", "items", "chunks_around", "item_chunks", "matching_item_keys",
    "item_parent", "phrase_candidates",
])
async def test_index_reader_filters_unreadable_from_every_entry(operation):
    """所有索引读取入口排除不可读及缺少标记的记录。

    @author 称霸幼儿园
    """
    documents = [
        {"item_key": "note:1", "ref": "note:1", "entity_type": "note", "title": "token",
         "content": "token", "summary": "token", "parent_ref": "kb:1", "chunk_index": 0,
         "readable": True},
        {"item_key": "note:2", "ref": "note:2", "entity_type": "note", "title": "token",
         "content": "token", "summary": "token", "parent_ref": "kb:2", "chunk_index": 0,
         "readable": False},
        {"item_key": "note:3", "ref": "note:3", "entity_type": "note", "title": "token",
         "content": "token", "summary": "token", "parent_ref": "kb:3", "chunk_index": 0},
    ]

    async def search(**kwargs):
        """按查询条件返回命中的索引记录。"""
        query = kwargs.get("query") or kwargs["knn"]["filter"]
        hits = [{"_source": {key: value for key, value in doc.items() if key in kwargs["_source"]}}
                for doc in documents if evaluate(query, doc)]
        return {"hits": {"hits": hits}}

    client = AsyncMock()
    client.search.side_effect = search
    reader = KnowledgeIndexReader(client)
    if operation == "lexical":
        hits = await reader.lexical("token", [], [], 10)
        assert [hit.ref for hit in hits] == ["note:1"]
    elif operation == "semantic":
        hits = await reader.semantic([1.0, 0.0], [], 10)
        assert [hit.ref for hit in hits] == ["note:1"]
    elif operation == "items":
        hits = await reader.items("token", [], 10)
        assert [hit.ref for hit in hits] == ["note:1"]
    elif operation == "chunks_around":
        hits = await reader.chunks_around([(doc["item_key"], 0) for doc in documents], 1)
        assert set(hits) == {"note:1"}
    elif operation == "item_chunks":
        assert [hit.ref for hit in await reader.item_chunks("note:1")] == ["note:1"]
        assert await reader.item_chunks("note:2") == []
        assert await reader.item_chunks("note:3") == []
    elif operation == "matching_item_keys":
        assert await reader.matching_item_keys([doc["item_key"] for doc in documents], []) == {"note:1"}
    elif operation == "item_parent":
        assert await reader.item_parent("note:1") == "kb:1"
        assert await reader.item_parent("note:2") is None
        assert await reader.item_parent("note:3") is None
    else:
        assert await reader.phrase_candidates("token", [], 10) == ["note:1"]


async def test_index_reader_preserves_source_line_ranges():
    """索引命中保留源行号。

    @author 称霸幼儿园
    """
    client = AsyncMock()
    client.search.return_value = {"hits": {"hits": [{"_source": {
        "item_key": "note:1", "ref": "note:1", "entity_type": "note", "title": "标题",
        "chunk_index": 0, "content": "正文", "start_line": 3, "end_line": 9,
    }}]}}
    hits = await KnowledgeIndexReader(client).lexical("正文", [], [], 10)
    assert (hits[0].start_line, hits[0].end_line) == (3, 9)
    assert {"start_line", "end_line"} <= set(client.search.call_args.kwargs["_source"])
