"""Harness 临时视觉附件、多模态编译与安全审计单元测试。

@author 称霸幼儿园
"""

import json

from harness.action.plane import ActionPlane
from harness.action.registry import ToolOutput, ToolRegistry, ToolSpec
from harness.context.builder import ContextBuilder
from harness.models import (
    ModelChunk,
    ToolCall,
    VisualAttachment,
    VisualImageMeta,
)
from models.catalog import LogicalModelMapping, ModelCatalogSnapshot, ProviderSnapshot
from models.scripted import ScriptedModel, ScriptStep
from tests.conftest import CharacterCounter, collect_events, make_harness, make_run
from tests.test_action import SearchArgs


def _attachment(attachment_id="visual:01", page_no=3):
    meta = VisualImageMeta(
        attachmentId=attachment_id,
        ref="doc:77",
        title="设计稿.pdf",
        pageNo=page_no,
        evidenceId="E4",
        contentVersion="v7",
        sourceTool="kb_view_doc",
        sourceCallId="call-view",
        mediaType="image/jpeg",
        width=20,
        height=10,
        sizeBytes=7,
        sha256="a" * 64,
        estimatedTokens=2000,
    )
    return VisualAttachment(data=b"\xff\xd8JPEG\xff\xd9", meta=meta)


def _vision_snapshot():
    return ModelCatalogSnapshot(
        version="1",
        providers=[ProviderSnapshot(
            providerKey="p",
            displayName="P",
            protocol="openai_compatible",
            baseUrl="http://provider",
            apiKey="key",
            models=["vision-model"],
            dataEgressAllowed=True,
            enabled=True,
        )],
        logicalModels={"agent_main": LogicalModelMapping(
            provider="p",
            model="vision-model",
            enabled=True,
            supportsVision=True,
        )},
    )


def _prepare_visual_run(run, attachment):
    run.workspace.put_visual(attachment)
    result = ActionResultFactory.create(attachment)
    plane = ActionPlane(ToolRegistry())
    plane.observe(run, result)


class ActionResultFactory:
    @staticmethod
    def create(attachment):
        from harness.models import ActionResult, ActionStatus

        return ActionResult(
            callId=attachment.meta.source_call_id,
            toolName="kb_view_doc",
            status=ActionStatus.SUCCESS,
            content='{"pages":[{"pageNo":3}]}',
            visuals=[attachment],
        )


async def test_action_and_observation_never_serialize_visual_bytes():
    """行动结果与观察只保留图像元数据，模型序列化不包含图片字节。"""
    attachment = _attachment()
    run = make_run(tools=["kb_view_doc"])

    _prepare_visual_run(run, attachment)
    observation = run.observations[0]

    assert observation.visuals == [attachment.meta]
    assert run.workspace.get_visual(attachment.meta.attachment_id).data == attachment.data
    serialized = json.dumps(observation.model_dump(mode="json", by_alias=True))
    assert "JPEG" not in serialized
    assert "data:image" not in serialized
    assert serialized.count("visual:01") >= 1


async def test_builder_attaches_latest_visuals_only_once_and_records_dispatch():
    """图像只进入紧随工具调用的一次请求，后续编译仅保留发送元数据。"""
    run = make_run(tools=["kb_view_doc"])
    run.model_snapshot = _vision_snapshot()
    _prepare_visual_run(run, _attachment())
    run.tool_exchanges = [run.tool_exchanges[0] if run.tool_exchanges else _exchange_from_observation(run)]
    builder = ContextBuilder(ScriptedModel([]), CharacterCounter())

    first = await builder.build(run, [])
    run.visual_dispatches.append(first.visual_dispatch)
    second = await builder.build(run, [])

    image_message = first.messages[-1]
    assert image_message["role"] == "user"
    assert image_message["content"][0]["type"] == "text"
    assert image_message["content"][1]["type"] == "image_url"
    assert image_message["content"][1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert first.visual_dispatch.images[0].ref == "doc:77"
    assert first.manifest.token_count >= 2000
    assert not any(isinstance(message.get("content"), list) for message in second.messages)
    assert second.visual_dispatch is None


def _exchange_from_observation(run):
    from harness.models import ToolExchange

    return ToolExchange(
        calls=[ToolCall(callId="call-view", name="kb_view_doc", arguments={"ref": "doc:77", "startPage": 3})],
        observations=list(run.observations),
    )


async def test_loop_emits_visual_audit_without_bytes_and_clears_workspace():
    """历史与 Trace 记录图片清单和关联 ID，完整事件流不包含图片字节，终态释放内存。"""
    attachment = _attachment()

    async def handler(_args, _action):
        _action.workspace.cache_pdf("doc:77", "v7", b"pdf-current")
        return ToolOutput(content='{"pages":1}', visuals=[attachment])

    registry = ToolRegistry()
    registry.register(ToolSpec(
        name="kb_view_doc",
        summary="读取资料页面图像",
        description="按页读取",
        args_model=SearchArgs,
        handler=handler,
    ))
    model = ScriptedModel([
        ScriptStep([ModelChunk(tool_calls=[ToolCall(
            callId="call-view",
            name="kb_view_doc",
            arguments={"query": "q"},
        )])]),
        ScriptStep([ModelChunk(text_delta="答案", finish=True)]),
    ])
    run = make_run(tools=["kb_view_doc"])
    run.model_snapshot = _vision_snapshot()

    events = await collect_events(make_harness(model, registry=registry), run)

    visual = next(event for event in events if event.type == "trace.visual")
    model_trace = next(event for event in events if event.type == "trace.model" and event.data["attributes"].get("dispatchId"))
    finished = next(event for event in events if event.type == "run.finished")
    assert visual.data["images"][0]["sha256"] == "a" * 64
    assert model_trace.data["attributes"]["dispatchId"] == visual.data["dispatchId"]
    assert finished.data["visualDispatches"][0]["images"][0]["pageNo"] == 3
    assert run.workspace.get_visual(attachment.meta.attachment_id) is None
    assert run.workspace.cached_pdf("doc:77", "v7") is None
    event_text = json.dumps([event.data for event in events], ensure_ascii=False, default=str)
    assert "data:image" not in event_text
    assert "JPEG" not in event_text
    assert "\uffff\uffd8" not in event_text
