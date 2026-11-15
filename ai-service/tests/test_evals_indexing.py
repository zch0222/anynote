"""索引验收语料、源导出与清理记录测试。

@author 称霸幼儿园
"""

import io
import json
from types import SimpleNamespace

import httpx
import pytest
from pypdf import PdfReader

from evals.run_indexing import (
    FixtureGateway,
    FixtureManifest,
    build_markdown_fixture,
    build_pdf_fixture,
    cleanup_api_fixture,
    expected_refs,
    export_fixture_documents,
    main_async,
    record_supplement_changes,
    seed_api_fixture,
    upload_fixture_subtitle,
)
from core.config import Settings
from indexing.models import KnowledgeDocumentBatch, KnowledgeExportPage, KnowledgeNoticeBatch, SourceDocument


def test_markdown_fixture_contains_full_code_and_table_blocks():
    """固定 Markdown 包含长代码、完整表格和深层标题。"""
    body = build_markdown_fixture({"codeLines": 100, "tableRows": 20})

    assert body.count("print(") == 100
    assert body.count("```") == 2
    assert "### 倒排词典" in body
    assert "| token-19 | 19 |" in body


@pytest.mark.parametrize("kind", ["text", "scanned", "columns"])
def test_pdf_fixtures_are_valid_with_expected_text_layers(kind):
    """三种 PDF 固定样本分别保留文本层、扫描图像和双栏文本。"""
    reader = PdfReader(io.BytesIO(build_pdf_fixture(kind)))

    assert len(reader.pages) == 1
    text = reader.pages[0].extract_text() or ""
    if kind == "scanned":
        assert not text.strip()
        assert "/XObject" in reader.pages[0]["/Resources"]
    else:
        assert "Indexing acceptance" in text
        if kind == "columns":
            assert "Left column" in text and "Right column" in text


def test_manifest_writes_only_non_secret_identifiers(tmp_path):
    """可恢复清理清单只写入资源标识，不写令牌和密码。"""
    manifest = FixtureManifest(prefix="m164_test", corpus_version=1)
    manifest.username = "m164user"
    manifest.user_id = 42
    manifest.refs["note"] = "note:9"
    manifest.object_names.append("doc/m164_test.pdf")
    output = tmp_path / "manifest.json"

    manifest.write(output)

    payload = json.loads(output.read_text(encoding="utf-8"))
    assert payload["refs"] == {"note": "note:9"}
    assert not {"password", "token", "accessToken", "refreshToken"} & payload.keys()


def test_expected_refs_include_subtypes_and_exclude_duplicate_entity_labels():
    """清理核对使用 canonical 引用并去重相同实体。"""
    manifest = FixtureManifest(prefix="m164_test", corpus_version=1)
    manifest.refs = {
        "kb": "kb:1", "note": "note:2", "code_note": "note:2",
        "transcript": "mooc_item:8#transcript", "summary": "mooc_item:8#summary",
    }

    assert expected_refs(manifest) == ["kb:1", "note:2", "mooc_item:8#transcript", "mooc_item:8#summary"]


async def test_gateway_rejects_unsuccessful_envelope_without_returning_body():
    """接口失败保留状态码且不回显潜在敏感响应正文。"""
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(200, json={"code": "B0001", "msg": "sensitive-detail"})
    )
    async with httpx.AsyncClient(transport=transport, base_url="http://gateway") as client:
        gateway = FixtureGateway(client)
        with pytest.raises(RuntimeError) as captured:
            await gateway.call("POST", "/api/note/bases", {"name": "fixture"})

    assert "B0001" in str(captured.value)
    assert "sensitive-detail" not in str(captured.value)


async def test_export_fixture_documents_reads_all_entity_pages_and_notice_batch():
    """导出核对遍历实体类型分页并读取通知批次。"""
    calls = []

    class FakeKnowledge:
        async def export(self, entity_type, after_id=0, kb_id=None, limit=200):
            calls.append((entity_type, after_id, kb_id))
            if entity_type == "note":
                document = SourceDocument(ref=f"note:{after_id + 1}", entity_type="note", entity_id=after_id + 1)
                return KnowledgeExportPage(documents=[document], has_more=after_id == 0, next_after_id=1)
            return KnowledgeExportPage()

    class FakeNotify:
        async def notices_batch(self, ids):
            assert ids == [9]
            return KnowledgeNoticeBatch(documents=[SourceDocument(ref="notice:9", entity_type="notice", entity_id=9)])

    manifest = FixtureManifest(prefix="m164_test", corpus_version=1, kb_id=7)
    manifest.refs["notice"] = "notice:9"

    documents = await export_fixture_documents(manifest, FakeKnowledge(), FakeNotify())

    assert [document.ref for document in documents] == ["note:1", "note:2", "notice:9"]
    assert ("note", 1, 7) in calls


async def test_cleanup_records_partial_failure_and_continues_remaining_resources():
    """清理单项失败后继续清理其余资源，并明确保留未清零状态。"""
    requests = []

    def handle(request):
        requests.append((request.method, request.url.path))
        return httpx.Response(200, json={"code": "B0001" if request.url.path.endswith("notes/2") else "00000"})

    manifest = FixtureManifest(prefix="m164_test", corpus_version=1, kb_id=7, mooc_id=8)
    manifest.refs = {"kb": "kb:7", "note": "note:2", "doc": "doc:3", "mooc_item": "mooc_item:4"}
    async with httpx.AsyncClient(transport=httpx.MockTransport(handle), base_url="http://gateway") as client:
        gateway = FixtureGateway(client)
        gateway.token = "private-test-token"
        result = await cleanup_api_fixture(manifest, gateway)

    assert result["errors"] == [{"ref": "note:2", "error_type": "RuntimeError"}]
    assert "doc:3" in result["api_deleted_refs"]
    assert ("DELETE", "/api/note/bases/7") in requests
    assert ("POST", "/api/auth/logout") in requests
    assert result["verified_zero"] is False


async def test_seed_api_fixture_uses_validated_names_and_records_created_resource_ids(tmp_path):
    """API 种子复用注册会话，遵守名称长度并记录七类实体及三份资料。"""
    state = {"task_name": "", "next_id": 10}

    class FakeGateway:
        token = None
        refresh_token = None

        async def call(self, _method, path, body=None, **kwargs):
            if path == "/api/auth/register":
                assert 6 <= len(body["username"]) <= 15
                assert 8 <= len(body["password"]) <= 15
                return {"token": {"accessToken": "private-register-token", "refreshToken": "private-register-refresh"}}
            if path == "/api/auth/login":
                raise AssertionError("注册响应已包含登录令牌，不应创建第二个会话")
            state["next_id"] += 1
            entity_id = state["next_id"]
            if path == "/api/note/bases":
                assert len(body["name"]) <= 15
                return {"id": entity_id}
            if path == "/api/note/notes" and body is not None:
                assert len(body["title"]) <= 15
                return entity_id
            if path == "/api/note/admin/noteTasks":
                state["task_name"] = body["taskName"]
                return {"id": entity_id}
            if path == "/api/note/docs/pdfs":
                assert kwargs["files"]["pdf"][1].startswith(b"%PDF")
                return {"id": entity_id}
            return entity_id

    class FakeKnowledge:
        async def scope(self, _token):
            assert _token == "private-register-token"
            return SimpleNamespace(user_id=9)

        async def documents_batch(self, refs):
            return KnowledgeDocumentBatch(documents=[
                SourceDocument(ref=refs[0], entity_type="doc", entity_id=int(refs[0].split(":")[1]), object_name=f"{refs[0]}.pdf")
            ])

    class FakeNotify:
        async def export_notices(self, after_id=0, limit=200):
            return KnowledgeExportPage(documents=[
                SourceDocument(ref="notice:90", entity_type="notice", entity_id=90, kb_id=11, title=f"任务：{state['task_name']}")
            ])

    corpus = {"version": 1, "markdown": {"codeLines": 2, "tableRows": 2}, "pdfKinds": ["text", "scanned", "columns"]}
    gateway = FakeGateway()
    manifest = await seed_api_fixture(gateway, FakeKnowledge(), FakeNotify(), corpus, tmp_path / "manifest.json")

    assert gateway.token == "private-register-token"
    assert gateway.refresh_token == "private-register-refresh"
    assert {ref.split(":")[0] for ref in manifest.refs.values()} == {"kb", "note", "doc", "mooc", "mooc_item", "task", "notice"}
    assert len([key for key in manifest.refs if key.startswith("doc_")]) == 3
    assert len(manifest.object_names) == 3


async def test_main_preserves_original_seed_failure(monkeypatch, tmp_path):
    """种子在返回清单前失败时保留原始异常类型。"""
    corpus = tmp_path / "corpus.json"
    corpus.write_text('{"version": 1}', encoding="utf-8")

    class FakeNacos:
        def __init__(self, *_args):
            pass

        async def close(self):
            pass

    class FakeRedis:
        async def aclose(self):
            pass

    async def fail_seed(*_args):
        raise LookupError

    monkeypatch.setenv("ANYNOTE_INTERNAL_SECRET", "secret")
    monkeypatch.setattr("evals.run_indexing.NacosManager", FakeNacos)
    monkeypatch.setattr("evals.run_indexing.aioredis.from_url", lambda *_args, **_kwargs: FakeRedis())
    monkeypatch.setattr("evals.run_indexing.seed_api_fixture", fail_seed)
    args = SimpleNamespace(gateway="http://gateway", corpus=str(corpus), output=str(tmp_path / "manifest.json"))

    with pytest.raises(LookupError):
        await main_async(args)


async def test_upload_subtitle_and_record_changes_use_internal_apis(monkeypatch):
    """字幕上传与补种变更通过签名内部 API，并记录精确资源 ID。"""
    requests = []

    def handle(request):
        requests.append(request)
        if request.url.path == "/":
            return httpx.Response(200, json={"code": "00000", "data": {"id": 99, "objectName": "mooc/srt/m164.srt"}})
        return httpx.Response(200, json={"code": "00000", "data": 100})

    transport = httpx.MockTransport(handle)
    real_client = httpx.AsyncClient

    def client_factory(*_args, **_kwargs):
        return real_client(transport=transport)

    monkeypatch.setattr("evals.run_indexing.httpx.AsyncClient", client_factory)
    settings = Settings(
        ANYNOTE_INTERNAL_SECRET="secret", FILE_SERVICE_URL="http://file", NOTE_SERVICE_URL="http://note",
    )
    manifest = FixtureManifest(prefix="m164", corpus_version=1, user_id=42, kb_id=7)
    manifest.refs["video"] = "mooc_item:10"

    await upload_fixture_subtitle(settings, manifest, "1\n00:00:01,000 --> 00:00:02,000\n正文")
    await record_supplement_changes(settings, manifest)

    assert manifest.file_ids == [99]
    assert manifest.object_names == ["mooc/srt/m164.srt"]
    assert [request.url.path for request in requests] == [
        "/", "/internal/v1/knowledge/changes", "/internal/v1/knowledge/mooc-items/10/summary-changes",
    ]
    assert all(request.headers.get("X-Internal-Sign") for request in requests)
    assert json.loads(requests[1].content)["entityType"] == "transcript"
