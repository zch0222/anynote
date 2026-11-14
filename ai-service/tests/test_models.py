"""模型目录与 OpenAI 兼容适配器测试。

@author 称霸幼儿园
"""

import asyncio

import httpx
import pytest

from core.config import HarnessRuntimeSettings
from models.catalog import (
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
