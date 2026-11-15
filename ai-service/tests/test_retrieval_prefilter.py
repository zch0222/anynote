"""第一段预过滤口径：读取与 Java 共享的权限矩阵逐条校验。

@author 称霸幼儿园
"""

import json
from pathlib import Path

import pytest

from harness.models import RunScope
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
             "ref": "doc:1"}
    own_elsewhere = {"entity_type": "note", "kb_id": 66, "create_by": 7, "permissions": "70000",
                     "data_scope": 1, "ref": "note:9"}
    own_listed = {**own_elsewhere, "ref": "note:5"}
    assert evaluate(query, notice) is False
    assert evaluate(query, in_kb) is True
    assert evaluate(query, own_elsewhere) is False
    assert evaluate(query, own_listed) is True


def test_default_run_scope_has_no_narrowing():
    """默认范围不生成收窄条件。"""
    assert build_narrowing_filter(None) is None
    assert build_narrowing_filter(RunScope()) is None
