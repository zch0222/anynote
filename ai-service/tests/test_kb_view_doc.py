"""`kb_view_doc` 权限、版本、预算、渲染与证据契约单元测试。

@author 称霸幼儿园
"""

import asyncio
import hashlib
import json

from core.config import HarnessRuntimeSettings
from harness.action.plane import ActionPlane
from harness.models import ActionErrorCategory, ActionStatus, ToolCall
from indexing.models import SourceDocument
from indexing.parsers.pdf_render import (
    PdfImageRegion,
    PdfPageOutOfRangeError,
    PdfRenderTimeoutError,
    RenderedPdfPage,
)
from models.catalog import LogicalModelMapping, ModelCatalogSnapshot, ProviderSnapshot
from retrieval.models import NOT_FOUND_MESSAGE
from tests.knowledge_fakes import (
    FakeFileClient,
    FakeIndexReader,
    FakeKnowledgeClient,
    chunk,
    make_tool_run,
    make_toolkit,
)
from tools.knowledge.common import VisualRenderLimiter
from tools.knowledge.kb_view_doc import (
    INVALID_PAGES_MESSAGE,
    PAGE_OUT_OF_RANGE_MESSAGE,
    PDF_TOO_LARGE_MESSAGE,
    RENDER_TIMEOUT_MESSAGE,
    SOURCE_UNAVAILABLE_MESSAGE,
    STALE_INDEX_NOTICE,
    VISION_UNSUPPORTED_MESSAGE,
    VISUAL_DISABLED_MESSAGE,
    VISUAL_NOTICE,
)


def _snapshot(supports_vision=True, egress=True):
    return ModelCatalogSnapshot(
        version="1",
        providers=[ProviderSnapshot(
            providerKey="p",
            displayName="P",
            protocol="openai_compatible",
            baseUrl="http://provider",
            apiKey="key",
            models=["vision"],
            dataEgressAllowed=egress,
            enabled=True,
        )],
        logicalModels={"agent_main": LogicalModelMapping(
            provider="p",
            model="vision",
            enabled=True,
            supportsVision=supports_vision,
        )},
    )


def _document(version="v7"):
    return SourceDocument(
        ref="doc:77",
        entityType="doc",
        entityId=77,
        kbId=1,
        title="设计稿.pdf",
        format="pdf",
        objectName="pdf/design.pdf",
        contentVersion=version,
    )


def _page(page_no=3):
    data = f"jpeg-page-{page_no}".encode()
    return RenderedPdfPage(
        page_no=page_no,
        data=data,
        width=200,
        height=100,
        sha256=hashlib.sha256(data).hexdigest(),
        regions=[PdfImageRegion(region_id=f"p{page_no}-r1", bbox=(0.5, 0.1, 0.9, 0.5))],
    )


class _Renderer:
    def __init__(self, error=None):
        self.calls = []
        self.error = error

    def __call__(self, data, page_numbers, **kwargs):
        self.calls.append((data, list(page_numbers), dict(kwargs)))
        if self.error is not None:
            raise self.error
        return [_page(page_no) for page_no in page_numbers]


def _runtime(**overrides):
    return HarnessRuntimeSettings(
        visual_read_enabled=True,
        **overrides,
    )


def _setup(*, allowed=True, snap=None, runtime=None, renderer=None, document=None):
    client = FakeKnowledgeClient()
    if allowed:
        client.allow("doc:77", version=(document or _document()).content_version)
    client.batch_documents["doc:77"] = document or _document()
    index = FakeIndexReader()
    files = FakeFileClient()
    files.blobs["pdf/design.pdf"] = b"pdf-current"
    renderer = renderer or _Renderer()
    registry, store = make_toolkit(client, index, file_client=files, renderer=renderer)
    run = make_tool_run(snap=snap or _snapshot(), runtime=runtime or _runtime())
    return registry, store, run, client, index, files, renderer


async def _call(registry, run, page=3, end_page=None, call_id="c1"):
    arguments = {"ref": "doc:77", "startPage": page}
    if end_page is not None:
        arguments["endPage"] = end_page
    return await ActionPlane(registry).execute(
        run,
        ToolCall(callId=call_id, name="kb_view_doc", arguments=arguments),
    )


def test_view_args_use_camel_case_page_contract():
    """工具 schema 只接受 doc 引用和 camelCase 的连续页码参数。"""
    registry, _store, _run, _client, _index, _files, _renderer = _setup()
    schema = registry.get("kb_view_doc").definition()["function"]["parameters"]
    assert set(schema["properties"]) == {"ref", "startPage", "endPage"}
    assert schema["required"] == ["ref", "startPage"]


async def test_view_returns_current_page_regions_text_parts_evidence_and_attachment():
    """成功读取返回同版本文本、归一化区域和页级原始证据，普通 JSON 不含图片字节。"""
    registry, store, run, _client, index, _files, renderer = _setup()
    index.chunks["doc:77"] = [
        chunk("doc:77", 0, "文本层", "doc", page=3, version="v7"),
        chunk("doc:77", 1, "图片文字", "doc", authority="transcript", page=3, version="v7",
              extraction_mode="ocr", source_region_id="p3-r1"),
    ]

    result = await _call(registry, run)

    assert result.status == ActionStatus.SUCCESS
    payload = json.loads(result.content)
    page = payload["pages"][0]
    assert payload["coordinateSpace"] == {"unit": "normalized", "origin": "topLeft"}
    assert payload["notices"] == [VISUAL_NOTICE]
    assert [(part["extractionMode"], part["sourceRegionId"]) for part in page["textParts"]] == [
        ("text", None),
        ("ocr", "p3-r1"),
    ]
    assert page["imageRegions"][0]["bbox"] == {"x0": 0.5, "y0": 0.1, "x1": 0.9, "y1": 0.5}
    assert result.evidence[0].authority == "original"
    assert result.evidence[0].locator == {"pageStart": 3, "pageEnd": 3, "visual": True}
    assert result.evidence[0].content == "文本层\n图片文字"
    assert result.visuals[0].meta.source_call_id == "c1"
    assert result.visuals[0].meta.content_version == "v7"
    assert result.diagnostics == {"pages": 1, "imageBytes": len(_page().data)}
    assert renderer.calls[0][1] == [3]
    assert "pdf/design.pdf" not in result.content
    assert "data:image" not in result.content
    assert "jpeg-page" not in result.content
    observation = ActionPlane(registry).observe(run, result)
    assert run.workspace.get_visual(result.visuals[0].meta.attachment_id).data == _page().data
    assert "jpeg-page" not in json.dumps(observation.model_dump(mode="json", by_alias=True))
    assert run.workspace.evidence[0].content == "文本层\n图片文字"


async def test_permission_denied_happens_before_document_or_file_read():
    """越权读取统一为不存在或不可读，权威文档、文件和渲染器均未调用。"""
    registry, _store, run, client, _index, files, renderer = _setup(allowed=False)

    result = await _call(registry, run)

    assert result.status == ActionStatus.FAILED
    assert result.error_category == ActionErrorCategory.NOT_FOUND
    assert result.content == NOT_FOUND_MESSAGE
    assert files.calls == []
    assert renderer.calls == []
    assert not [call for call in client.calls if call[0] == "documents_batch"]


async def test_disabled_or_unsupported_vision_fails_before_gate_and_download():
    """视觉开关关闭或主模型未声明能力时，在权限和文件读取前失败关闭。"""
    disabled_registry, _store, disabled_run, client, _index, files, renderer = _setup(
        runtime=HarnessRuntimeSettings(visual_read_enabled=False),
    )
    disabled = await _call(disabled_registry, disabled_run)
    assert disabled.error_category == ActionErrorCategory.DEPENDENCY_UNAVAILABLE
    assert disabled.content == VISUAL_DISABLED_MESSAGE

    unsupported_registry, _store, unsupported_run, unsupported_client, _index, unsupported_files, unsupported_renderer = _setup(
        snap=_snapshot(supports_vision=False),
    )
    unsupported = await _call(unsupported_registry, unsupported_run)
    assert unsupported.error_category == ActionErrorCategory.DEPENDENCY_UNAVAILABLE
    assert unsupported.content == VISION_UNSUPPORTED_MESSAGE
    for current_client, current_files, current_renderer in (
        (client, files, renderer),
        (unsupported_client, unsupported_files, unsupported_renderer),
    ):
        assert current_client.calls == []
        assert current_files.calls == []
        assert current_renderer.calls == []


async def test_egress_denied_happens_before_gate_and_download():
    """模型供应商不允许知识数据出域时，权限后的文档内容和图像均不读取。"""
    registry, _store, run, client, _index, files, renderer = _setup(snap=_snapshot(egress=False))

    result = await _call(registry, run)

    assert result.error_category == ActionErrorCategory.DEPENDENCY_UNAVAILABLE
    assert client.calls == []
    assert files.calls == []
    assert renderer.calls == []


async def test_invalid_page_range_and_run_budget_do_not_download():
    """单次区间与单运行页数预算均在文件下载前执行。"""
    registry, _store, run, _client, _index, files, renderer = _setup(
        runtime=_runtime(visual_max_pages_per_run=1),
    )
    invalid = await _call(registry, run, page=4, end_page=2)
    assert invalid.error_category == ActionErrorCategory.INVALID_ARGUMENTS
    assert invalid.content == INVALID_PAGES_MESSAGE.format(limit=2)

    success = await _call(registry, run)
    assert success.status == ActionStatus.SUCCESS
    exhausted = await _call(registry, run, page=4, call_id="c2")
    assert exhausted.error_category == ActionErrorCategory.INVALID_ARGUMENTS
    assert len(files.calls) == 1
    assert len(renderer.calls) == 1


async def test_same_version_pdf_is_cached_across_visual_calls():
    """同一运行读取相邻页时复用同版本 PDF，仅渲染请求的新页面。"""
    registry, _store, run, _client, _index, files, renderer = _setup()

    first = await _call(registry, run)
    second = await _call(registry, run, page=4, call_id="c2")

    assert first.status == second.status == ActionStatus.SUCCESS
    assert files.calls == [("pdf/design.pdf", 50 * 1024 * 1024)]
    assert [call[1] for call in renderer.calls] == [[3], [4]]


async def test_stale_index_text_is_not_mixed_with_current_page():
    """索引内容版本落后时仍返回当前图像，但 textParts 与证据原文为空并附提示。"""
    registry, _store, run, _client, index, _files, _renderer = _setup()
    index.chunks["doc:77"] = [chunk("doc:77", 0, "旧文本", "doc", page=3, version="v6")]

    result = await _call(registry, run)

    payload = json.loads(result.content)
    assert payload["pages"][0]["textParts"] == []
    assert STALE_INDEX_NOTICE in payload["notices"]
    assert result.evidence[0].content == ""
    assert result.evidence[0].version == "v7"
    assert result.evidence[0].stale is False


async def test_page_limit_timeout_and_download_limit_have_confirmed_messages():
    """页码越界、渲染超时和下载超限使用已确认分类与文案。"""
    out_registry, _store, out_run, _client, _index, _files, _renderer = _setup(
        renderer=_Renderer(PdfPageOutOfRangeError(16)),
    )
    out = await _call(out_registry, out_run)
    assert out.error_category == ActionErrorCategory.INVALID_ARGUMENTS
    assert out.content == PAGE_OUT_OF_RANGE_MESSAGE.format(page_count=16)

    timeout_registry, _store, timeout_run, _client, _index, _files, _renderer = _setup(
        renderer=_Renderer(PdfRenderTimeoutError("timeout")),
    )
    timeout = await _call(timeout_registry, timeout_run)
    assert timeout.error_category == ActionErrorCategory.TOOL_TIMEOUT
    assert timeout.content == RENDER_TIMEOUT_MESSAGE
    assert timeout.retryable is True

    large_registry, _store, large_run, _client, _index, large_files, large_renderer = _setup(
        runtime=_runtime(visual_max_pdf_bytes=1024),
    )
    large_files.blobs["pdf/design.pdf"] = b"x" * 1025
    large = await _call(large_registry, large_run)
    assert large.error_category == ActionErrorCategory.DEPENDENCY_UNAVAILABLE
    assert large.content == PDF_TOO_LARGE_MESSAGE
    assert large_renderer.calls == []


async def test_missing_object_name_does_not_call_file_or_renderer():
    """权威资料缺少对象名时返回原始文件不可读，不进入文件和渲染阶段。"""
    document = _document()
    document.object_name = None
    registry, _store, run, _client, _index, files, renderer = _setup(document=document)

    result = await _call(registry, run)

    assert result.error_category == ActionErrorCategory.DEPENDENCY_UNAVAILABLE
    assert result.content == SOURCE_UNAVAILABLE_MESSAGE
    assert files.calls == []
    assert renderer.calls == []


async def test_render_limiter_enforces_instance_concurrency():
    """实例级限流器确保并发任务不超过配置槽位。"""
    limiter = VisualRenderLimiter(1)
    active = 0
    maximum = 0

    async def render():
        nonlocal active, maximum
        async with limiter.slot():
            active += 1
            maximum = max(maximum, active)
            await asyncio.sleep(0.01)
            active -= 1

    await asyncio.gather(render(), render(), render())
    assert maximum == 1


async def test_updated_document_is_regated_rendered_and_gets_new_evidence():
    """同运行内原文件版本更新后重新 gate、下载和渲染，不复用旧版本视觉证据。"""
    registry, _store, run, client, _index, files, _renderer = _setup()
    first = await _call(registry, run)

    updated = _document(version="v8")
    client.batch_documents["doc:77"] = updated
    client.allow("doc:77", version="v8")
    files.blobs["pdf/design.pdf"] = b"pdf-updated"
    second = await _call(registry, run, call_id="c2")

    assert first.evidence[0].evidence_id != second.evidence[0].evidence_id
    assert first.evidence[0].version == "v7"
    assert second.evidence[0].version == "v8"
    assert second.visuals[0].meta.content_version == "v8"
    assert len(files.calls) == 2
    assert len([call for call in client.calls if call[0] == "authorize"]) == 2
