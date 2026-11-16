"""检索会话：范围缓存、批量授权、错误归类与知识端点客户端。

@author 称霸幼儿园
"""

import json

import httpx
import pytest
from elastic_transport import ConnectionError as TransportConnectionError

from clients._internal import InternalServiceError
from clients.knowledge import KnowledgeClient
from core.config import Settings
from harness.action.plane import FatalActionError, ToolExecutionError
from harness.models import ActionErrorCategory, RunScope
from models.catalog import ModelCatalogSnapshot
from retrieval.models import NOT_FOUND_MESSAGE, SEARCH_UNAVAILABLE_MESSAGE
from retrieval.session import RetrievalSession
from retrieval.settings import RetrievalSettings
from tests.knowledge_fakes import FakeIndexReader, FakeKnowledgeClient, snapshot


def _session(client: FakeKnowledgeClient, scope: RunScope | None = None,
             index: FakeIndexReader | None = None) -> RetrievalSession:
    return RetrievalSession("run-1", "token", scope, snapshot(), client, index)  # type: ignore[arg-type]


async def test_authorize_batches_by_one_hundred_and_keeps_readable_only():
    """250 个候选去重后按每批 100 条确认，只返回可读项。"""
    client = FakeKnowledgeClient()
    for index in range(0, 250, 2):
        client.allow(f"note:{index + 1}")
    items = [(f"note:{index + 1}", None) for index in range(250)] + [("note:1", None)]

    readable = await _session(client).authorize(items)

    assert client.count("authorize") == 3
    assert len(readable) == 125
    assert ("note:1", None) in readable


async def test_authorized_mooc_navigation_reaches_registered_evidence():
    """通过权限确认的慕课标识进入最终引用定位。"""
    client = FakeKnowledgeClient()
    client.allow("mooc_item:4", "transcript")
    client.readable[("mooc_item:4", "transcript")] = client.readable[
        ("mooc_item:4", "transcript")
    ].model_copy(update={"mooc_id": 8})
    session = _session(client)
    await session.authorize([("mooc_item:4", "transcript")])
    evidence = session.evidence.register(
        item_key="mooc_item:4#transcript", entity_type="transcript", text="字幕", title="视频",
        locator={"startTimeMs": 12000}, kb_id=1, kb_name="课程库", authority="transcript",
        content_version="v1", stale=False, permission_basis="MEMBER", retrieval=None,
        selected_reason="kb_search",
    )
    assert evidence.locator == {"startTimeMs": 12000, "moocId": 8}


async def test_scope_request_uses_explicit_run_scope_once():
    """显式范围按原样传给 note，且只请求一次。"""
    client = FakeKnowledgeClient()
    session = _session(client, RunScope(knowledgeBaseIds=[3], refs=["doc:4"]))
    await session.scope()
    await session.scope()
    assert client.calls == [("scope", ("token", [3], ["doc:4"]))]


async def test_default_run_scope_is_normalized_to_none():
    """两个列表都为空的范围视为默认范围。"""
    session = _session(FakeKnowledgeClient(), RunScope())
    assert session.run_scope is None
    assert session.in_run_scope("note:1", 99) is True


@pytest.mark.parametrize(
    ("code", "category", "message"),
    [("A0404", ActionErrorCategory.NOT_FOUND, NOT_FOUND_MESSAGE),
     ("A0160", ActionErrorCategory.INVALID_ARGUMENTS, "正文读取范围不合法")],
)
async def test_call_note_maps_returnable_errors(code, category, message):
    """不存在或不可读、参数错误交还模型。"""
    async def failing():
        raise InternalServiceError("anynote-note", "正文读取范围不合法" if code == "A0160" else "x", code)

    with pytest.raises(ToolExecutionError) as captured:
        await _session(FakeKnowledgeClient()).call_note(failing())
    assert captured.value.category == category
    assert str(captured.value) == message


@pytest.mark.parametrize("code", [None, "A0301", "B0001"])
async def test_call_note_other_failures_are_fatal(code):
    """网络失败、鉴权失败或服务错误时权限无法确认，抛出不可降级错误。"""
    async def failing():
        raise InternalServiceError("anynote-note", "x", code)

    with pytest.raises(FatalActionError) as captured:
        await _session(FakeKnowledgeClient()).call_note(failing())
    assert captured.value.category == "KNOWLEDGE_ACCESS_UNAVAILABLE"


async def test_call_index_maps_transport_errors_and_missing_index():
    """索引连接失败或未配置索引时返回依赖不可用。"""
    async def failing():
        raise TransportConnectionError("down")

    session = _session(FakeKnowledgeClient(), index=FakeIndexReader())
    with pytest.raises(ToolExecutionError) as captured:
        await session.call_index(failing())
    assert captured.value.category == ActionErrorCategory.DEPENDENCY_UNAVAILABLE
    assert str(captured.value) == SEARCH_UNAVAILABLE_MESSAGE
    with pytest.raises(ToolExecutionError):
        _session(FakeKnowledgeClient()).index_reader()


async def test_snapshot_without_retrieval_uses_defaults():
    """快照缺少检索参数时使用与 Java 一致的默认值。"""
    parsed = ModelCatalogSnapshot.model_validate({"version": "1:0", "retrieval": None})
    assert parsed.retrieval == RetrievalSettings()
    custom = ModelCatalogSnapshot.model_validate({"version": "1:0", "retrieval": {"rrfK": 30, "version": 2}})
    assert custom.retrieval.rrf_k == 30
    assert custom.retrieval.authority_factor("generated") == 0.7


async def test_knowledge_client_user_endpoints_send_token_and_parse():
    """用户端点同时携带内部签名与 accessToken，并解析统一信封与错误码。"""
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.url.path, request.headers.get("accesstoken"), json.loads(request.content or b"{}")))
        assert request.headers.get("from-source") == "inner"
        path = request.url.path
        if path.endswith("/scope"):
            return httpx.Response(200, json={"code": "00000", "data": {"userId": 7, "admin": False,
                                  "defaultScope": True, "knowledgeBases": [{"kbId": 1, "name": "库", "role": "READ"}]}})
        if path.endswith("/authorize"):
            return httpx.Response(200, json={"code": "00000", "data": {"items": [{"ref": "note:1",
                                  "readable": True, "kbId": 1}]}})
        if path.endswith("/stats"):
            return httpx.Response(200, json={"code": "00000", "data": {"knowledgeBases": [{"kbId": 1,
                                  "counts": {"note": 2}}]}})
        return httpx.Response(200, json={"code": "A0404", "msg": "知识内容不存在或不可读", "data": None})

    client = KnowledgeClient(
        Settings(ANYNOTE_INTERNAL_SECRET="s", NOTE_SERVICE_URL="http://note"),
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout),
    )
    scope = await client.scope("tok", None, None)
    assert scope.kb_ids == [1]
    items = await client.authorize("tok", [("note:1", None)])
    assert items[0].readable is True
    stats = await client.stats("tok", [1])
    assert stats.knowledge_bases[0].counts == {"note": 2}
    with pytest.raises(InternalServiceError) as captured:
        await client.content("tok", {"ref": "note:2"})
    assert captured.value.code == "A0404"
    assert all(token == "tok" for _path, token, _body in seen)
    assert seen[0][2] == {"knowledgeBaseIds": None, "refs": None}
    assert seen[2][2] == {"knowledgeBaseIds": [1]}
