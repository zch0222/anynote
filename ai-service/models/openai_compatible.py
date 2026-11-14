"""OpenAI 兼容流式对话适配器。

@author 称霸幼儿园
"""

import asyncio
import json
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx

from core.config import HarnessRuntimeSettings
from core.errors import MODEL_TIMEOUT_MESSAGE, MODEL_UNAVAILABLE_MESSAGE
from harness.models import ModelChunk, TokenUsage, ToolCall
from models.catalog import ModelCatalogSnapshot, ModelError, ProviderSnapshot


class ModelTimeoutError(ModelError):
    """模型四类超时。"""

    category = "MODEL_TIMEOUT"

    def __init__(self, kind: str, retryable: bool):
        super().__init__(MODEL_TIMEOUT_MESSAGE)
        self.kind = kind
        self.retryable = retryable


class ModelServiceError(ModelError):
    """模型网络或服务端错误。"""

    def __init__(self, retryable: bool):
        super().__init__(MODEL_UNAVAILABLE_MESSAGE)
        self.retryable = retryable


class OpenAICompatibleAdapter:
    """调用 OpenAI 兼容 chat/completions SSE 接口。

    @author 称霸幼儿园
    """

    def __init__(self, client_factory=None):
        self._client_factory = client_factory or httpx.AsyncClient

    async def stream(
        self,
        logical_name: str,
        snapshot: ModelCatalogSnapshot,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        runtime: HarnessRuntimeSettings,
        contains_knowledge: bool,
    ) -> AsyncIterator[ModelChunk]:
        """解析模型并流式返回文本、工具调用与用量。

        :param logical_name: 逻辑模型名
        :param snapshot: 本次运行配置快照
        :param messages: 编译后的模型输入
        :param tools: 本次调用可用工具
        :param runtime: 超时与重试配置
        :param contains_knowledge: 输入是否包含知识库内容
        :return: 模型输出异步序列
        """
        provider, model = snapshot.resolve(logical_name, contains_knowledge)
        deadline = time.monotonic() + runtime.total_timeout_s
        for attempt in range(runtime.model_max_attempts):
            output_state = {"produced": False}
            try:
                async for chunk in self._stream_once(
                    provider,
                    model,
                    messages,
                    tools,
                    runtime,
                    deadline,
                    output_state,
                ):
                    yield chunk
                return
            except ModelError as error:
                can_retry = error.retryable and not output_state["produced"]
                if not can_retry or attempt + 1 >= runtime.model_max_attempts:
                    raise

    async def _stream_once(
        self,
        provider: ProviderSnapshot,
        model: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        runtime: HarnessRuntimeSettings,
        deadline: float,
        output_state: dict[str, bool],
    ) -> AsyncIterator[ModelChunk]:
        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if tools:
            body["tools"] = tools
        timeout = httpx.Timeout(
            connect=runtime.connect_timeout_s,
            read=None,
            write=runtime.connect_timeout_s,
            pool=runtime.connect_timeout_s,
        )
        first_deadline = min(deadline, time.monotonic() + runtime.first_output_timeout_s)
        fragments: dict[int, dict[str, Any]] = {}
        usage: TokenUsage | None = None
        first_produced = False
        try:
            async with self._client_factory(timeout=timeout) as client:
                request = client.build_request(
                    "POST",
                    f"{provider.base_url.rstrip('/')}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {provider.api_key.get_secret_value()}",
                        "Content-Type": "application/json",
                        "Accept": "text/event-stream",
                    },
                    json=body,
                )
                response = await self._wait(
                    client.send(request, stream=True),
                    first_deadline,
                    deadline,
                    "FIRST_OUTPUT",
                )
                if response.status_code == 429 or response.status_code >= 500:
                    await response.aclose()
                    raise ModelServiceError(retryable=True)
                if response.status_code >= 400:
                    await response.aclose()
                    raise ModelServiceError(retryable=False)
                try:
                    lines = response.aiter_lines()
                    while True:
                        remaining_first = 0 if first_produced else first_deadline - time.monotonic()
                        idle = runtime.stream_idle_timeout_s if remaining_first <= 0 else remaining_first
                        try:
                            line = await self._wait(
                                anext(lines),
                                time.monotonic() + idle,
                                deadline,
                                "FIRST_OUTPUT" if remaining_first > 0 else "STREAM_IDLE",
                            )
                        except StopAsyncIteration:
                            break
                        if not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if payload == "[DONE]":
                            break
                        chunk = json.loads(payload)
                        if chunk.get("usage"):
                            usage = self._usage(chunk["usage"])
                        text, has_tool = self._accept_chunk(chunk, fragments)
                        if text or has_tool:
                            first_produced = True
                            output_state["produced"] = True
                        if text:
                            yield ModelChunk(text_delta=text)
                finally:
                    await response.aclose()
        except ModelError:
            raise
        except httpx.ConnectTimeout as error:
            raise ModelTimeoutError("CONNECT", retryable=True) from error
        except httpx.TimeoutException as error:
            raise ModelTimeoutError("FIRST_OUTPUT", retryable=True) from error
        except (httpx.NetworkError, httpx.RemoteProtocolError) as error:
            raise ModelServiceError(retryable=True) from error
        except (httpx.HTTPError, json.JSONDecodeError, KeyError, TypeError) as error:
            raise ModelServiceError(retryable=False) from error
        calls = []
        for index in sorted(fragments):
            fragment = fragments[index]
            try:
                arguments = json.loads(fragment["arguments"] or "{}")
            except json.JSONDecodeError as error:
                raise ModelServiceError(retryable=False) from error
            calls.append(
                ToolCall(
                    call_id=fragment["id"] or f"call-{index}",
                    name=fragment["name"],
                    arguments=arguments,
                )
            )
        yield ModelChunk(
            tool_calls=calls,
            usage=usage or TokenUsage(),
            finish=True,
        )

    async def _wait(
        self,
        awaitable,
        stage_deadline: float,
        total_deadline: float,
        kind: str,
    ):
        remaining = min(stage_deadline, total_deadline) - time.monotonic()
        if remaining <= 0:
            raise ModelTimeoutError("TOTAL", retryable=False)
        try:
            return await asyncio.wait_for(awaitable, timeout=remaining)
        except TimeoutError as error:
            total = time.monotonic() >= total_deadline
            raise ModelTimeoutError(
                "TOTAL" if total else kind,
                retryable=not total,
            ) from error

    @staticmethod
    def _accept_chunk(chunk: dict[str, Any], fragments: dict[int, dict[str, Any]]) -> tuple[str, bool]:
        text_parts = []
        has_tool = False
        for choice in chunk.get("choices", []):
            delta = choice.get("delta", {})
            content = delta.get("content")
            if isinstance(content, str):
                text_parts.append(content)
            for call in delta.get("tool_calls") or []:
                has_tool = True
                index = call.get("index", 0)
                fragment = fragments.setdefault(
                    index,
                    {"id": None, "name": "", "arguments": ""},
                )
                fragment["id"] = call.get("id") or fragment["id"]
                function = call.get("function", {})
                fragment["name"] += function.get("name") or ""
                fragment["arguments"] += function.get("arguments") or ""
        return "".join(text_parts), has_tool

    @staticmethod
    def _usage(value: dict[str, Any]) -> TokenUsage:
        return TokenUsage(
            prompt_tokens=value.get("prompt_tokens"),
            completion_tokens=value.get("completion_tokens"),
            total_tokens=value.get("total_tokens"),
            known=True,
        )
