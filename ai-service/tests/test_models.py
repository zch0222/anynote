"""模型目录与 OpenAI 兼容适配器测试。

@author 称霸幼儿园
"""

import asyncio
import json

import httpx
import pytest

from core.config import HarnessRuntimeSettings
from models.catalog import (
    LogicalModelMapping,
    ModelCatalogSnapshot,
    ModelConfigurationError,
    ProviderSnapshot,
)
from models.openai_compatible import (
    ModelServiceError,
    ModelTimeoutError,
    OpenAICompatibleAdapter,
)


def snapshot():
    return ModelCatalogSnapshot(
        version="1:1",
        providers=[
            {
                "providerKey": "openai",
                "displayName": "OpenAI",
                "protocol": "openai_compatible",
                "baseUrl": "https://model.test/v1",
                "apiKey": "sk-test",
                "models": ["gpt-test"],
                "dataEgressAllowed": True,
                "enabled": True,
            }
        ],
        logicalModels={"agent_main": {"provider": "openai", "model": "gpt-test"}},
    )


def sse(*chunks, usage=None):
    lines = []
    for chunk in chunks:
        lines.append(f"data: {chunk}\n")
    if usage:
        lines.append(
            'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n'
        )
    lines.append("data: [DONE]\n\n")
    return "".join(lines).encode()


async def collect(adapter, runtime=None):
    return [
        chunk
        async for chunk in adapter.stream(
            "agent_main",
            snapshot(),
            [{"role": "user", "content": "你好"}],
            [],
            runtime or HarnessRuntimeSettings(model_max_attempts=1),
            True,
        )
    ]


async def test_stream_retry_usage_and_tool_assembly():
    """首个输出前服务端失败可重试，工具片段与用量正确汇总。"""
    requests = 0

    def handler(request):
        nonlocal requests
        requests += 1
        if requests == 1:
            return httpx.Response(500)
        assert request.headers["Authorization"] == "Bearer sk-test"
        content = sse(
            '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"kb","arguments":"{\\"q\\""}}]}}]}',
            '{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"笔记\\"}"}}]}}]}',
            usage=True,
        )
        return httpx.Response(200, content=content)

    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout)
    )
    chunks = await collect(adapter, HarnessRuntimeSettings(model_max_attempts=2))
    assert requests == 2
    final = chunks[-1]
    assert final.tool_calls[0].arguments == {"q": "笔记"}
    assert final.usage.total_tokens == 5


async def test_output_failure_is_never_replayed():
    """已产生文本后的流错误不重放请求。"""
    requests = 0

    class BrokenStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'data: {"choices":[{"delta":{"content":"\\u90e8\\u5206"}}]}\n\n'
            raise httpx.ReadError("broken")

    def handler(_request):
        nonlocal requests
        requests += 1
        return httpx.Response(200, stream=BrokenStream())

    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout)
    )
    with pytest.raises(ModelServiceError):
        await collect(adapter, HarnessRuntimeSettings(model_max_attempts=2))
    assert requests == 1


async def test_partial_tool_output_failure_is_never_replayed():
    """工具参数片段已经开始输出后，网络失败同样禁止重试。"""
    requests = 0

    class BrokenToolStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"kb","arguments":"{"}}]}}]}\n\n'
            raise httpx.ReadError("broken")

    def handler(_request):
        nonlocal requests
        requests += 1
        return httpx.Response(200, stream=BrokenToolStream())

    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout)
    )
    with pytest.raises(ModelServiceError):
        await collect(adapter, HarnessRuntimeSettings(model_max_attempts=2))
    assert requests == 1


@pytest.mark.parametrize("kind", ["FIRST_OUTPUT", "STREAM_IDLE", "TOTAL"])
async def test_first_idle_and_total_timeouts(kind):
    """首输出、流空闲和总时长分别产生对应超时分类。"""
    class SlowStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            if kind != "FIRST_OUTPUT":
                yield b'data: {"choices":[{"delta":{"content":"first"}}]}\n\n'
            await asyncio.sleep(0.05)
            yield sse('{"choices":[{"delta":{"content":"后到"}}]}')

    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _request: httpx.Response(200, stream=SlowStream())),
            timeout=timeout,
        )
    )
    runtime = HarnessRuntimeSettings(
        model_max_attempts=1,
        first_output_timeout_s=0.005 if kind == "FIRST_OUTPUT" else 1,
        stream_idle_timeout_s=0.005 if kind == "STREAM_IDLE" else 1,
        total_timeout_s=0.005 if kind == "TOTAL" else 1,
    )
    with pytest.raises(ModelTimeoutError) as captured:
        await collect(adapter, runtime)
    assert captured.value.kind == kind


async def test_connect_timeout_has_independent_category():
    """建连超时使用 CONNECT 分类。"""
    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _request: (_ for _ in ()).throw(httpx.ConnectTimeout("timeout"))),
            timeout=timeout,
        )
    )
    with pytest.raises(ModelTimeoutError) as captured:
        await collect(adapter)
    assert captured.value.kind == "CONNECT"


def test_catalog_rejects_disabled_model_and_unmarked_egress():
    """停用模型与未标出域供应商不能接收知识内容。"""
    current = snapshot()
    current.providers[0].data_egress_allowed = False
    with pytest.raises(ModelConfigurationError):
        current.resolve("agent_main", True)
    provider, model = current.resolve("agent_main", False)
    assert model == "gpt-test"
    current.providers[0].enabled = False
    with pytest.raises(ModelConfigurationError):
        current.resolve("agent_main", False)


def test_logical_model_defaults_to_no_reasoning():
    """未下发推理配置时逻辑模型默认不解析推理。"""
    current = snapshot()
    mapping = current.logical_models["agent_main"]
    assert mapping.reasoning_format == "none"
    assert mapping.reasoning_passthrough == "none"


def test_logical_model_parses_reasoning_fields_from_camel_case():
    """快照下发的推理格式与回传方式按 camelCase 解析并可显式配置。"""
    current = ModelCatalogSnapshot(
        version="1:1",
        providers=[],
        logicalModels={
            "agent_main": {
                "provider": "openai",
                "model": "gpt-test",
                "reasoningFormat": "think_tag",
                "reasoningPassthrough": "original",
            }
        },
    )
    mapping = current.logical_models["agent_main"]
    assert mapping.reasoning_format == "think_tag"
    assert mapping.reasoning_passthrough == "original"


def test_logical_model_rejects_unknown_reasoning_format():
    """非法推理格式在校验阶段拒绝，避免静默回落。"""
    with pytest.raises(Exception):
        ModelCatalogSnapshot(
            version="1:1",
            providers=[],
            logicalModels={
                "agent_main": {
                    "provider": "openai",
                    "model": "gpt-test",
                    "reasoningFormat": "auto",
                }
            },
        )


def reasoning_snapshot(fmt: str, passthrough: str = "none") -> ModelCatalogSnapshot:
    """构造指定推理配置的快照。

    :param fmt: 推理输出格式
    :param passthrough: 回传方式
    :return: 模型目录快照
    """
    current = snapshot()
    current.logical_models["agent_main"] = LogicalModelMapping(
        provider="openai",
        model="gpt-test",
        reasoning_format=fmt,
        reasoning_passthrough=passthrough,
    )
    return current


async def collect_reasoning(adapter, snap, runtime=None):
    """收集一次带推理配置的流式输出。

    :param adapter: 适配器
    :param snap: 模型目录快照
    :param runtime: 运行参数
    :return: 片段列表
    """
    return [
        chunk
        async for chunk in adapter.stream(
            "agent_main",
            snap,
            [{"role": "user", "content": "测试"}],
            [],
            runtime or HarnessRuntimeSettings(),
            False,
        )
    ]


async def test_reasoning_content_field_is_parsed():
    """reasoning_content 字段的推理增量单独输出且计入首输出。"""
    chunks_data = [
        '{"choices":[{"delta":{"reasoning_content":"先想想"}}]}',
        '{"choices":[{"delta":{"reasoning_content":"再想想"}}]}',
        '{"choices":[{"delta":{"content":"答案"}}]}',
    ]
    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(200, stream=_StreamOnce(sse(*chunks_data)))
            ),
            timeout=timeout,
        )
    )
    chunks = await collect_reasoning(adapter, reasoning_snapshot("reasoning_content"))
    reasoning = "".join(c.reasoning_delta or "" for c in chunks if c.reasoning_delta)
    text = "".join(c.text_delta or "" for c in chunks if c.text_delta)
    assert reasoning == "先想想再想想"
    assert text == "答案"


class _StreamOnce(httpx.AsyncByteStream):
    """单次 SSE 响应流。"""

    def __init__(self, payload: bytes):
        self._payload = payload

    async def __aiter__(self):
        yield self._payload


async def test_reasoning_field_gateway_format():
    """reasoning 字段的网关推理输出同样解析。"""
    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(
                    200,
                    stream=_StreamOnce(
                        sse(
                            '{"choices":[{"delta":{"reasoning":"思考"}}]}',
                            '{"choices":[{"delta":{"content":"回答"}}]}',
                        )
                    ),
                )
            ),
            timeout=timeout,
        )
    )
    chunks = await collect_reasoning(adapter, reasoning_snapshot("reasoning"))
    assert chunks[0].reasoning_delta == "思考"
    assert any(c.text_delta == "回答" for c in chunks)


async def test_think_tag_streaming_split_across_chunks():
    """正文开头的 think 标签跨片段剥离，其余位置标签保留为正文。"""
    pieces = [
        '{"choices":[{"delta":{"content":"  <thi"}}]}',
        '{"choices":[{"delta":{"content":"nk>第一段思考"}}]}',
        '{"choices":[{"delta":{"content":"继续思考</th"}}]}',
        '{"choices":[{"delta":{"content":"ink>正式回答"}}]}',
    ]
    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(200, stream=_StreamOnce(sse(*pieces)))
            ),
            timeout=timeout,
        )
    )
    chunks = await collect_reasoning(adapter, reasoning_snapshot("think_tag"))
    reasoning = "".join(c.reasoning_delta or "" for c in chunks if c.reasoning_delta)
    text = "".join(c.text_delta or "" for c in chunks if c.text_delta)
    assert reasoning == "第一段思考继续思考"
    assert text == "正式回答"


async def test_think_tag_unclosed_means_no_body():
    """流结束仍未闭合时整段算思考、没有正文。"""
    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(
                    200,
                    stream=_StreamOnce(
                        sse('{"choices":[{"delta":{"content":"<think>只有思考没有收尾"}}]}')
                    ),
                )
            ),
            timeout=timeout,
        )
    )
    chunks = await collect_reasoning(adapter, reasoning_snapshot("think_tag"))
    reasoning = "".join(c.reasoning_delta or "" for c in chunks if c.reasoning_delta)
    text = "".join(c.text_delta or "" for c in chunks if c.text_delta)
    assert reasoning == "只有思考没有收尾"
    assert text == ""


async def test_think_tag_mid_body_tag_stays_text():
    """正文中间出现的 think 标签不会被剥离。"""
    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(
                    200,
                    stream=_StreamOnce(
                        sse(
                            '{"choices":[{"delta":{"content":"回答里提到 <think> 标签"}}]}',
                        )
                    ),
                )
            ),
            timeout=timeout,
        )
    )
    chunks = await collect_reasoning(adapter, reasoning_snapshot("think_tag"))
    text = "".join(c.text_delta or "" for c in chunks if c.text_delta)
    assert text == "回答里提到 <think> 标签"
    assert not any(c.reasoning_delta for c in chunks)


async def test_none_format_keeps_think_tag_as_text():
    """未配置推理格式时不剥离任何标签。"""
    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(
                    200,
                    stream=_StreamOnce(
                        sse('{"choices":[{"delta":{"content":"<think>原样保留"}}]}')
                    ),
                )
            ),
            timeout=timeout,
        )
    )
    chunks = await collect_reasoning(adapter, reasoning_snapshot("none"))
    text = "".join(c.text_delta or "" for c in chunks if c.text_delta)
    assert text == "<think>原样保留"
    assert not any(c.reasoning_delta for c in chunks)


async def test_reasoning_interrupt_emitted_before_retry():
    """推理或正文已产出后的可重试失败先发中断片段再重试。"""
    requests = 0

    class FirstBrokenStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'data: {"choices":[{"delta":{"reasoning_content":"\\u601d\\u8003\\u4e00\\u534a"}}]}\n\n'

            raise httpx.ReadError("broken")

    class SecondStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield sse('{"choices":[{"delta":{"content":"重来后回答"}}]}')

    def handler(_request):
        nonlocal requests
        requests += 1
        stream = FirstBrokenStream() if requests == 1 else SecondStream()
        return httpx.Response(200, stream=stream)

    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout)
    )
    chunks = await collect_reasoning(
        adapter, reasoning_snapshot("reasoning_content"), HarnessRuntimeSettings(model_max_attempts=2)
    )
    assert requests == 2
    assert chunks[0].reasoning_delta == "思考一半"
    assert chunks[1].reasoning_interrupted is True
    assert any(c.text_delta == "重来后回答" for c in chunks)


def test_passthrough_none_strips_assistant_reasoning():
    """回传方式 none 时 assistant 消息上的思考文本被清除。"""
    messages = [
        {"role": "user", "content": "问题"},
        {"role": "assistant", "content": "", "reasoning_content": "旧思考", "tool_calls": []},
    ]
    assert OpenAICompatibleAdapter._apply_passthrough(messages, "none", "reasoning_content") == [
        {"role": "user", "content": "问题"},
        {"role": "assistant", "content": "", "tool_calls": []},
    ]


def test_passthrough_empty_and_original_map_fields():
    """empty 补空字段，original 原样回传并按格式映射字段名。"""
    messages = [
        {"role": "assistant", "content": "", "reasoning_content": "旧思考", "tool_calls": []},
    ]
    assert OpenAICompatibleAdapter._apply_passthrough(messages, "empty", "reasoning_content") == [
        {"role": "assistant", "content": "", "reasoning_content": "", "tool_calls": []},
    ]
    assert OpenAICompatibleAdapter._apply_passthrough(messages, "original", "reasoning") == [
        {"role": "assistant", "content": "", "reasoning": "旧思考", "tool_calls": []},
    ]
    assert OpenAICompatibleAdapter._apply_passthrough(messages, "original", "reasoning_content") == [
        {"role": "assistant", "content": "", "reasoning_content": "旧思考", "tool_calls": []},
    ]


def _line(delta: dict) -> bytes:
    """把一个增量对象编码成一行 SSE。"""
    return f"data: {json.dumps({'choices': [{'delta': delta}]}, ensure_ascii=False)}\n\n".encode()


REASONING_LINES = {
    "reasoning_content": _line({"reasoning_content": "思考"}),
    "reasoning": _line({"reasoning": "思考"}),
    "think_tag": _line({"content": "<think>思考"}),
}
BODY_LINES = {
    "reasoning_content": _line({"content": "正文前半段"}),
    "reasoning": _line({"content": "正文前半段"}),
    "think_tag": _line({"content": "</think>正文前半段"}),
}
TOOL_LINE = _line({"tool_calls": [{"index": 0, "id": "c1", "function": {"name": "kb", "arguments": "{"}}]})


def _broken_adapter(first_lines: list[bytes]):
    """构造首个请求输出指定片段后断流、第二个请求输出完整回答的适配器。

    :param first_lines: 首个请求在断流前输出的 SSE 行
    :return: （适配器, 请求计数器）
    """
    counter = {"requests": 0}

    class FirstBrokenStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            for line in first_lines:
                yield line
            raise httpx.ReadError("broken")

    def handler(_request):
        counter["requests"] += 1
        if counter["requests"] == 1:
            return httpx.Response(200, stream=FirstBrokenStream())
        return httpx.Response(200, stream=_StreamOnce(sse(json.dumps(
            {"choices": [{"delta": {"content": "完整回答"}}]}, ensure_ascii=False))))

    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout)
    )
    return adapter, counter


@pytest.mark.parametrize("fmt", ["reasoning_content", "reasoning", "think_tag"])
async def test_reasoning_only_break_retries_once(fmt):
    """只输出了思考就断流：重试一次，发一个中断片段，最终正文只来自第二次请求。"""
    adapter, counter = _broken_adapter([REASONING_LINES[fmt]])
    chunks = await collect_reasoning(adapter, reasoning_snapshot(fmt), HarnessRuntimeSettings(model_max_attempts=2))
    assert counter["requests"] == 2
    interrupted = [chunk for chunk in chunks if chunk.reasoning_interrupted]
    assert len(interrupted) == 1
    assert interrupted[0].retry_attempt == 2
    assert "".join(chunk.text_delta or "" for chunk in chunks) == "完整回答"


@pytest.mark.parametrize("fmt", ["reasoning_content", "reasoning", "think_tag"])
async def test_break_after_body_is_never_retried(fmt):
    """思考后已出现正文再断流：不重试，抛模型服务错误，只发一次请求。"""
    adapter, counter = _broken_adapter([REASONING_LINES[fmt], BODY_LINES[fmt]])
    with pytest.raises(ModelServiceError):
        await collect_reasoning(adapter, reasoning_snapshot(fmt), HarnessRuntimeSettings(model_max_attempts=2))
    assert counter["requests"] == 1


@pytest.mark.parametrize("fmt", ["reasoning_content", "reasoning", "think_tag"])
async def test_break_after_tool_fragment_is_never_retried(fmt):
    """思考后已出现工具调用片段再断流：不重试。"""
    adapter, counter = _broken_adapter([REASONING_LINES[fmt], TOOL_LINE])
    with pytest.raises(ModelServiceError):
        await collect_reasoning(adapter, reasoning_snapshot(fmt), HarnessRuntimeSettings(model_max_attempts=2))
    assert counter["requests"] == 1


async def test_retry_without_output_sends_attempt_marker_without_interrupt():
    """没有任何输出时的重试也发出带尝试序号的片段，但不标记思考中断。"""
    adapter, counter = _broken_adapter([])
    chunks = await collect_reasoning(adapter, reasoning_snapshot("reasoning_content"),
                                     HarnessRuntimeSettings(model_max_attempts=2))
    assert counter["requests"] == 2
    markers = [chunk for chunk in chunks if chunk.retry_attempt is not None]
    assert [(chunk.retry_attempt, chunk.reasoning_interrupted) for chunk in markers] == [(2, False)]


async def test_think_tag_answer_that_is_only_a_tag_prefix_is_kept():
    """整段回答只是开启标签的严格前缀（如单个 <）时，原样作为正文输出。"""
    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(200, stream=_StreamOnce(sse(
                    json.dumps({"choices": [{"delta": {"content": "<"}}]}))))
            ),
            timeout=timeout,
        )
    )
    chunks = await collect_reasoning(adapter, reasoning_snapshot("think_tag"))
    assert "".join(chunk.text_delta or "" for chunk in chunks) == "<"
    assert not any(chunk.reasoning_delta for chunk in chunks)


@pytest.mark.parametrize(
    ("fmt", "passthrough", "field", "expected"),
    [
        ("reasoning_content", "original", "reasoning_content", "第一轮思考"),
        ("reasoning", "original", "reasoning", "第一轮思考"),
        ("reasoning_content", "empty", "reasoning_content", ""),
        ("reasoning_content", "none", None, None),
    ],
)
async def test_harness_passes_turn_reasoning_back_by_passthrough(fmt, passthrough, field, expected):
    """第二次模型请求的 assistant 工具调用消息按回传方式带上第一轮思考，字段名随推理格式映射。"""
    from harness.action.registry import ToolOutput, ToolRegistry, ToolSpec
    from tests.conftest import collect_events, make_harness, make_run
    from tests.test_action import SearchArgs

    bodies: list[dict] = []
    reasoning_key = "reasoning" if fmt == "reasoning" else "reasoning_content"

    def handler(request):
        bodies.append(json.loads(request.content))
        if len(bodies) == 1:
            content = b"".join([
                _line({reasoning_key: "第一轮思考"}),
                _line({"tool_calls": [{"index": 0, "id": "c1",
                                       "function": {"name": "kb", "arguments": "{\"query\":\"q\"}"}}]}),
                b"data: [DONE]\n\n",
            ])
        else:
            content = sse(json.dumps({"choices": [{"delta": {"content": "答案"}}]}, ensure_ascii=False))
        return httpx.Response(200, stream=_StreamOnce(content))

    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout)
    )
    registry = ToolRegistry()

    async def tool(_args, _action):
        return ToolOutput(content="结果")

    registry.register(ToolSpec("kb", "检索", "测试", SearchArgs, tool))
    run = make_run(["kb"])
    run.model_snapshot = reasoning_snapshot(fmt, passthrough)
    await collect_events(make_harness(adapter, registry), run)
    assert len(bodies) == 2
    assistant = next(item for item in bodies[1]["messages"] if item["role"] == "assistant")
    other = {"reasoning", "reasoning_content"} - {field}
    if field is None:
        assert "reasoning" not in assistant and "reasoning_content" not in assistant
    else:
        assert assistant[field] == expected
        assert not other & set(assistant)
