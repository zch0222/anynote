"""索引管线内部客户端单元测试。

@author 称霸幼儿园
"""

import httpx
import pytest

from clients._internal import InternalServiceError
from clients.file import FileClient
from clients.knowledge import KnowledgeClient
from clients.notify import NotifyClient
from core.auth import sign_timestamp
from core.config import Settings
from indexing.models import DOC_STATUS_UNEXTRACTABLE


def _settings() -> Settings:
    return Settings(
        ANYNOTE_INTERNAL_SECRET="secret-test",
        NOTE_SERVICE_URL="http://note:18091",
        FILE_SERVICE_URL="http://file:8095",
        NOTIFY_SERVICE_URL="http://notify:9066",
    )


async def test_knowledge_client_calls_and_chunked_batch():
    """KnowledgeClient 正确携带签名调用变更、导出、分片批量读取与状态回写接口。"""
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        sig_ts = request.headers.get("x-internal-timestamp")
        assert request.headers.get("from-source") == "inner"
        assert request.headers.get("x-internal-sign") == sign_timestamp("secret-test", sig_ts)
        calls.append((request.method, request.url.path))
        if request.url.path == "/internal/v1/knowledge/changes":
            return httpx.Response(
                200,
                json={
                    "code": "00000",
                    "data": {
                        "changes": [
                            {
                                "id": 11,
                                "entityType": "transcript",
                                "entityId": 5,
                                "kbId": 2,
                                "operation": "UPDATE",
                            }
                        ],
                        "nextCursor": 11,
                        "latestCursor": 11,
                    },
                },
            )
        if request.url.path == "/internal/v1/knowledge/documents/batch":
            import json

            body = json.loads(request.content.decode())
            docs = [
                {
                    "ref": ref,
                    "entityType": "note",
                    "entityId": idx + 1,
                    "kbId": 2,
                    "title": ref,
                    "format": "markdown",
                    "body": "ok",
                }
                for idx, ref in enumerate(body["refs"])
                if ref != "note:missing"
            ]
            missing = ["note:missing"] if "note:missing" in body["refs"] else []
            return httpx.Response(200, json={"code": "00000", "data": {"documents": docs, "missingRefs": missing}})
        if request.url.path == "/internal/v1/knowledge/docs/9/index-status":
            return httpx.Response(200, json={"code": "00000", "data": "SUCCESS"})
        return httpx.Response(404)

    client = KnowledgeClient(
        _settings(),
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout),
    )
    page = await client.changes(after_id=10, limit=50)
    assert page.changes[0].ref == "mooc_item:5#transcript"

    refs = [f"note:{i}" for i in range(105)] + ["note:missing"]
    batch = await client.documents_batch(refs)
    assert len(batch.documents) == 105
    assert batch.missing_refs == ["note:missing"]

    await client.update_doc_index_status(9, DOC_STATUS_UNEXTRACTABLE)
    assert calls.count(("POST", "/internal/v1/knowledge/documents/batch")) == 2


async def test_file_client_streams_bytes_and_enforces_limit():
    """FileClient 支持流式下载字节并在超限或空路径时报错。"""

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/internal/v1/files/content"
        assert request.url.params.get("objectName") == "docs/a.pdf"
        return httpx.Response(200, content=b"%PDF-1.4\nhello", headers={"content-type": "application/pdf"})

    client = FileClient(
        _settings(),
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout),
    )
    data = await client.download_bytes("docs/a.pdf", max_bytes=1024)
    assert data == b"%PDF-1.4\nhello"

    with pytest.raises(InternalServiceError):
        await client.download_bytes("  ")

    with pytest.raises(InternalServiceError):
        await client.download_bytes("docs/a.pdf", max_bytes=4)


async def test_notify_client_export_and_batch():
    """NotifyClient 正确导出有效通知并处理缺失 id。"""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/internal/v1/notices/export":
            return httpx.Response(
                200,
                json={
                    "code": "00000",
                    "data": {
                        "documents": [
                            {
                                "ref": "notice:3",
                                "entityType": "notice",
                                "entityId": 3,
                                "kbId": 1,
                                "title": "系统公告",
                                "format": "plain_text",
                                "body": "请本周提交作业",
                                "authority": "authoritative",
                            }
                        ],
                        "nextAfterId": 3,
                        "hasMore": False,
                    },
                },
            )
        if request.url.path == "/internal/v1/notices/batch":
            return httpx.Response(
                200,
                json={
                    "code": "00000",
                    "data": {
                        "documents": [],
                        "missingIds": [99],
                    },
                },
            )
        return httpx.Response(404)

    client = NotifyClient(
        _settings(),
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout),
    )
    export_page = await client.export_notices(after_id=0, limit=50)
    assert export_page.documents[0].ref == "notice:3"
    assert export_page.documents[0].authority == "authoritative"
    batch = await client.notices_batch([99])
    assert batch.missing_ids == [99]


async def test_export_accepts_null_next_after_id_and_attributes():
    """导出结果允许 Java 末页返回的 null nextAfterId 与 null attributes。"""

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "code": "00000",
                "data": {
                    "documents": [
                        {
                            "ref": "note:7",
                            "entityType": "note",
                            "entityId": 7,
                            "kbId": 1,
                            "title": "尾页",
                            "format": "markdown",
                            "body": "ok",
                            "attributes": None,
                        }
                    ],
                    "nextAfterId": None,
                    "hasMore": False,
                },
            },
        )

    client = KnowledgeClient(
        _settings(),
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout),
    )
    page = await client.export("note", after_id=0, limit=10)
    assert page.has_more is False
    assert page.next_after_id is None
    assert page.documents[0].attributes == {}
