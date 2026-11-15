"""第一段权限：把检索范围翻译为 Elasticsearch 预过滤条件。

口径与 note 的 `KnowledgeAccessService` 检索可读性一致（列表可见且详情不低于 4），
作者条款不受库成员关系限制；超管只在显式范围的库内使用超管口径。

@author 称霸幼儿园
"""

from typing import Any

from harness.models import RunScope
from retrieval.models import EXCLUDED_ENTITY_TYPES, KnowledgeScope, ScopeKnowledgeBase

READABLE_DIGIT = "[4-7]"
MOOC_FAMILY = ("mooc", "mooc_item", "transcript", "summary")
ROLE_MANAGE = "MANAGE"
ROLE_EDIT = "EDIT"
ROLE_READ = "READ"
ROLE_ADMIN = "ADMIN"


def slot_readable(slot: int) -> dict[str, Any]:
    """生成「五位权限串第 slot 位可读（≥4）」的条件。

    :param slot: 位序，0 为作者位
    :return: regexp 查询
    """
    pattern = "." * slot + READABLE_DIGIT + "." * (4 - slot)
    return {"regexp": {"permissions": pattern}}


def build_access_filter(scope: KnowledgeScope) -> dict[str, Any]:
    """生成当前用户在检索范围内可读的条件（不含调用方收窄）。

    :param scope: note 返回的检索范围
    :return: bool should 查询
    """
    user_id = scope.user_id
    should: list[dict[str, Any]] = [
        _note_author(user_id),
        _doc_author(user_id, scope.knowledge_bases),
        _mooc_author(user_id, scope.knowledge_bases),
    ]
    for knowledge_base in scope.knowledge_bases:
        admin_power = scope.admin and knowledge_base.explicit
        should.extend(_kb_clauses(user_id, knowledge_base, admin_power))
    return {"bool": {"should": should, "minimum_should_match": 1}}


def build_narrowing_filter(run_scope: RunScope | None) -> dict[str, Any] | None:
    """生成调用方显式范围的收窄条件：知识库或实体引用之一命中。

    :param run_scope: 运行的检索范围
    :return: 收窄条件，默认范围时为空
    """
    if run_scope is None or run_scope.is_default:
        return None
    should: list[dict[str, Any]] = []
    if run_scope.knowledge_base_ids:
        should.append({"terms": {"kb_id": list(run_scope.knowledge_base_ids)}})
    if run_scope.refs:
        should.append({"terms": {"ref": list(run_scope.refs)}})
    return {"bool": {"should": should, "minimum_should_match": 1}}


def build_prefilter(scope: KnowledgeScope, run_scope: RunScope | None) -> list[dict[str, Any]]:
    """生成召回时使用的完整预过滤条件列表（排除通知、收窄、可读）。

    :param scope: note 返回的检索范围
    :param run_scope: 运行的检索范围
    :return: 放入 bool.filter 的条件列表
    """
    filters: list[dict[str, Any]] = [
        {"term": {"readable": True}},
        {"bool": {"must_not": [{"terms": {"entity_type": list(EXCLUDED_ENTITY_TYPES)}}]}},
    ]
    narrowing = build_narrowing_filter(run_scope)
    if narrowing is not None:
        filters.append(narrowing)
    filters.append(build_access_filter(scope))
    return filters


def _entity(*types: str) -> dict[str, Any]:
    return {"terms": {"entity_type": list(types)}}


def _any_of(*clauses: dict[str, Any]) -> dict[str, Any]:
    return {"bool": {"should": list(clauses), "minimum_should_match": 1}}


def _note_author(user_id: int) -> dict[str, Any]:
    return {"bool": {"filter": [_entity("note"), {"term": {"create_by": user_id}}, slot_readable(0)]}}


def _member_slots(role: str, mooc: bool) -> list[dict[str, Any]]:
    if role == ROLE_MANAGE:
        return [slot_readable(1), slot_readable(2)] if mooc else [slot_readable(1)]
    if role in (ROLE_EDIT, ROLE_READ):
        return [slot_readable(2)]
    return []


def _doc_author(user_id: int, knowledge_bases: list[ScopeKnowledgeBase]) -> dict[str, Any]:
    readable: list[dict[str, Any]] = [slot_readable(0), slot_readable(3)]
    for knowledge_base in knowledge_bases:
        role = _membership_role(knowledge_base)
        if role is None:
            continue
        readable.append({"bool": {"filter": [{"term": {"kb_id": knowledge_base.kb_id}},
                                             _any_of(*_member_slots(role, mooc=False))]}})
    return {"bool": {"filter": [_entity("doc"), {"term": {"create_by": user_id}}, _any_of(*readable)]}}


def _mooc_author(user_id: int, knowledge_bases: list[ScopeKnowledgeBase]) -> dict[str, Any]:
    readable: list[dict[str, Any]] = [slot_readable(0), slot_readable(3), slot_readable(4)]
    for knowledge_base in knowledge_bases:
        role = _membership_role(knowledge_base)
        if role is None:
            continue
        readable.append({"bool": {"filter": [{"term": {"kb_id": knowledge_base.kb_id}},
                                             _any_of(*_member_slots(role, mooc=True))]}})
    return {"bool": {"filter": [_entity(*MOOC_FAMILY), {"term": {"create_by": user_id}}, _any_of(*readable)]}}


def _membership_role(knowledge_base: ScopeKnowledgeBase) -> str | None:
    if knowledge_base.role == ROLE_ADMIN:
        return None
    return knowledge_base.role if knowledge_base.role in (ROLE_MANAGE, ROLE_EDIT, ROLE_READ) else None


def _list_visible(role: str) -> dict[str, Any]:
    if role == ROLE_MANAGE:
        return {"terms": {"data_scope": [2, 3]}}
    return {"term": {"data_scope": 3}}


def _kb_clauses(user_id: int, knowledge_base: ScopeKnowledgeBase, admin_power: bool) -> list[dict[str, Any]]:
    kb_term = {"term": {"kb_id": knowledge_base.kb_id}}
    role = _membership_role(knowledge_base)
    clauses: list[dict[str, Any]] = [{"bool": {"filter": [_entity("kb"), kb_term]}}]
    if admin_power:
        clauses.append({"bool": {"filter": [_entity("note", "doc", "task"), kb_term]}})
        mooc_readable = [slot_readable(3), slot_readable(4)]
        if role is not None:
            mooc_readable.extend(_member_slots(role, mooc=True))
        clauses.append({"bool": {"filter": [_entity(*MOOC_FAMILY), kb_term, _any_of(*mooc_readable)]}})
        return clauses
    if role is None:
        return clauses
    clauses.append({"bool": {"filter": [_entity("task"), kb_term, {"term": {"task_member_ids": user_id}}]}})
    clauses.append({
        "bool": {
            "filter": [_entity("note"), kb_term, _list_visible(role), _any_of(*_member_slots(role, mooc=False))],
            "must_not": [{"term": {"create_by": user_id}}],
        }
    })
    clauses.append({
        "bool": {
            "filter": [_entity("doc"), kb_term, _list_visible(role),
                       _any_of(*_member_slots(role, mooc=False), slot_readable(3))],
        }
    })
    clauses.append({
        "bool": {
            "filter": [_entity(*MOOC_FAMILY), kb_term, _list_visible(role),
                       _any_of(*_member_slots(role, mooc=True), slot_readable(3), slot_readable(4))],
        }
    })
    return clauses
