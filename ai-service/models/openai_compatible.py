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
from models.catalog import ModelCatalogSnapshot, ModelConfigurationError, ModelError, ProviderSnapshot


class ModelTimeoutError(ModelError):
    """模型四类超时。"""

    category = "MODEL_TIMEOUT"

    def __init__(self, kind: str, retryable: bool):
        super().__init__(MODEL_TIMEOUT_MESSAGE)
        self.kind = kind
        self.retryable = retryable


class ModelServiceError(ModelError):
    """模型网络或服务端错误。"""

    def __init__(self, retryable: bool, had_output: bool = False):
        super().__init__(MODEL_UNAVAILABLE_MESSAGE)
        self.retryable = retryable
        self.had_output = had_output


THINK_OPEN = "<think>"
THINK_CLOSE = "</think>"


class _ThinkTagState:
    """跨片段剥离正文开头的   think 标签状态机。

    只认本轮回复开头（去掉前导空白后）的开启标签；正文其余位置的标签一律当普通文字。
    流结束时仍未闭合，整段算思考、本轮没有正文。

    @author 称霸幼儿园
    """

    _PROBING = "probing"
    _REASONING = "reasoning"
    _TEXT = "text"

    def __init__(self):
        self._phase = self._PROBING
        self._pending = ""

    def feed(self, text: str) -> tuple[str | None, str | None]:
        """喂入一个正文增量。

        :param text: 正文增量
        :return: （思考增量, 正文增量），任一可为空
        """
        if self._phase == self._TEXT:
            return None, text
        buffer = self._pending + text
        if self._phase == self._PROBING:
            stripped = buffer.lstrip()
            if not stripped:
                self._pending = ""
                return None, None
            if stripped.startswith(THINK_OPEN):
                self._phase = self._REASONING
                self._pending = ""
                return self.feed(stripped[len(THINK_OPEN):])
            if len(stripped) < len(THINK_OPEN) and THINK_OPEN.startswith(stripped):
                # 仍可能是被拆开的开启标签，等下一个片段再判定
                self._pending = buffer
                return None, None
            self._phase = self._TEXT
            return None, buffer
        # reasoning 阶段：找闭合标签，支持跨片段半个标签的情况
        index = buffer.find(THINK_CLOSE)
        if index >= 0:
            reasoning = buffer[:index]
            rest = buffer[index + len(THINK_CLOSE):]
            self._phase = self._TEXT
            return reasoning, rest
        keep = self._split_open_tail(buffer)
        self._pending = buffer[len(keep):]
        return keep or None, None

    def finish(self) -> tuple[str | None, str | None]:
        """流结束时收尾：未闭合的思考整段算思考；仍在判定开头标签时，扣住的文字原样算正文。

        :return: （剩余思考文本, 剩余正文文本），任一可为空
        """
        pending = self._pending or None
        self._pending = ""
        if self._phase == self._REASONING:
            return pending, None
        if self._phase == self._PROBING:
            self._phase = self._TEXT
            return None, pending
        return None, None

    @staticmethod
    def _split_open_tail(buffer: str) -> str:
        """保留可能是半个闭合标签的尾部，其余作为思考输出。

        :param buffer: 未闭合的思考缓冲
        :return: 可立即输出的思考文本，可能为空串
        """
        for size in range(len(THINK_CLOSE) - 1, 0, -1):
            if buffer.endswith(THINK_CLOSE[:size]):
                return buffer[:-size]
        return buffer


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
        mapping = snapshot.logical_models.get(logical_name)
        reasoning_format = mapping.reasoning_format if mapping else "none"
        passthrough = mapping.reasoning_passthrough if mapping else "none"
        deadline = time.monotonic() + runtime.total_timeout_s
        messages = self._apply_passthrough(messages, passthrough, reasoning_format)
        for attempt in range(runtime.model_max_attempts):
            output_state = {"body_emitted": False, "reasoning_emitted": False}
            try:
                async for chunk in self._stream_once(
                    provider,
                    model,
                    messages,
                    tools,
                    runtime,
                    deadline,
                    output_state,
                    reasoning_format,
                ):
                    yield chunk
                return
            except ModelError as error:
                can_retry = error.retryable and not output_state["body_emitted"]
                if not can_retry or attempt + 1 >= runtime.model_max_attempts:
                    raise
                yield ModelChunk(
                    retry_attempt=attempt + 2,
                    reasoning_interrupted=output_state["reasoning_emitted"],
                )

    @staticmethod
    def _apply_passthrough(
        messages: list[dict[str, Any]],
        passthrough: str,
        reasoning_format: str,
    ) -> list[dict[str, Any]]:
        """按逻辑模型配置处理 assistant 消息上的推理回传字段。

        上下文构建器把该轮思考全文以 ``reasoning_content`` 键挂在 assistant 工具调用消息上；
        本方法按回传方式原样回传（字段名随推理格式映射）、改成空字段或清除。

        :param messages: 编译后的模型输入
        :param passthrough: 回传方式（none / empty / original）
        :param reasoning_format: 该模型的推理输出格式
        :return: 调整后的消息列表
        """
        if reasoning_format == "none":
            return [{k: v for k, v in item.items() if k != "reasoning_content"} for item in messages]
        field = "reasoning" if reasoning_format == "reasoning" else "reasoning_content"
        adjusted: list[dict[str, Any]] = []
        for item in messages:
            if item.get("role") != "assistant":
                adjusted.append(item)
                continue
            copy = dict(item)
            carried = copy.pop("reasoning_content", None)
            if passthrough == "original" and carried:
                copy[field] = carried
            elif passthrough == "empty":
                copy[field] = ""
            adjusted.append(copy)
        return adjusted

    async def _stream_once(
        self,
        provider: ProviderSnapshot,
        model: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        runtime: HarnessRuntimeSettings,
        deadline: float,
        output_state: dict[str, bool],
        reasoning_format: str = "none",
    ) -> AsyncIterator[ModelChunk]:
        """发起一次流式请求。

        output_state 记录本次请求是否已产出正文（正文增量或工具调用片段）与思考增量，供重试判断。

        :param provider: 供应商配置
        :param model: 实际模型名
        :param messages: 模型输入
        :param tools: 工具定义
        :param runtime: 超时配置
        :param deadline: 总时长截止时刻
        :param output_state: 本次请求的产出标记
        :param reasoning_format: 推理输出格式
        :return: 模型输出异步序列
        """
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
        think_state = _ThinkTagState() if reasoning_format == "think_tag" else None
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
                        text, reasoning, has_tool = self._accept_chunk(
                            chunk, fragments, reasoning_format,
                        )
                        if text or reasoning or has_tool:
                            first_produced = True
                        if has_tool:
                            output_state["body_emitted"] = True
                        if reasoning:
                            output_state["reasoning_emitted"] = True
                            yield ModelChunk(reasoning_delta=reasoning)
                        if think_state is not None and text:
                            think_text, plain_text = think_state.feed(text)
                            if think_text:
                                output_state["reasoning_emitted"] = True
                                yield ModelChunk(reasoning_delta=think_text)
                            if plain_text:
                                output_state["body_emitted"] = True
                                yield ModelChunk(text_delta=plain_text)
                        elif text:
                            output_state["body_emitted"] = True
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
        if think_state is not None:
            reasoning_tail, text_tail = think_state.finish()
            if reasoning_tail:
                yield ModelChunk(reasoning_delta=reasoning_tail)
            if text_tail:
                yield ModelChunk(text_delta=text_tail)
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
            reasoning_tokens=usage.reasoning_tokens if usage else None,
            finish=True,
        )

    async def embed(
        self,
        snapshot: ModelCatalogSnapshot,
        texts: list[str],
        timeout_s: float = 30.0,
    ) -> list[list[float]] | None:
        """调用 OpenAI 兼容 embeddings 接口生成向量。

        :param snapshot: 当前模型目录快照
        :param texts: 待向量化文本列表
        :param timeout_s: 请求超时秒数
        :return: 向量列表；当 Embedding 未启用时返回 None
        """
        resolved = snapshot.resolve_embedding()
        if resolved is None:
            return None
        if not texts:
            return []
        provider, model, expected_dims = resolved
        body: dict[str, Any] = {"model": model, "input": texts}
        if expected_dims is not None:
            body["dimensions"] = expected_dims
        url = f"{provider.base_url.rstrip('/')}/embeddings"
        headers = {
            "Authorization": f"Bearer {provider.api_key.get_secret_value()}",
            "Content-Type": "application/json",
        }
        try:
            async with self._client_factory(timeout=timeout_s) as client:
                response = await client.post(url, headers=headers, json=body)
        except httpx.ConnectTimeout as error:
            raise ModelTimeoutError("CONNECT", retryable=True) from error
        except httpx.TimeoutException as error:
            raise ModelTimeoutError("TOTAL", retryable=True) from error
        except (httpx.NetworkError, httpx.RemoteProtocolError) as error:
            raise ModelServiceError(retryable=True) from error
        except httpx.HTTPError as error:
            raise ModelServiceError(retryable=False) from error

        if response.status_code >= 500 or response.status_code == 429:
            raise ModelServiceError(retryable=True)
        if response.status_code != 200:
            raise ModelServiceError(retryable=False)

        try:
            payload = response.json()
            items = sorted(payload["data"], key=lambda entry: int(entry.get("index", 0)))
            vectors = [[float(v) for v in entry["embedding"]] for entry in items]
        except (ValueError, KeyError, TypeError) as error:
            raise ModelServiceError(retryable=False) from error

        if len(vectors) != len(texts):
            raise ModelServiceError(retryable=False)
        for vector in vectors:
            if not vector or (expected_dims is not None and len(vector) != expected_dims):
                raise ModelConfigurationError()
        return vectors

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
    def _accept_chunk(
        chunk: dict[str, Any],
        fragments: dict[int, dict[str, Any]],
        reasoning_format: str = "none",
    ) -> tuple[str, str, bool]:
        """解析一个增量片段为正文、推理与工具调用碎片。

        :param chunk: SSE 增量对象
        :param fragments: 工具调用碎片累积
        :param reasoning_format: 推理输出格式，think_tag 正文标签由状态机处理
        :return: （正文增量, 推理增量, 是否含工具调用）
        """
        text_parts = []
        reasoning_parts = []
        has_tool = False
        for choice in chunk.get("choices", []):
            delta = choice.get("delta", {})
            content = delta.get("content")
            if isinstance(content, str):
                text_parts.append(content)
            if reasoning_format in ("reasoning_content", "reasoning"):
                reasoning = delta.get(reasoning_format)
                if isinstance(reasoning, str):
                    reasoning_parts.append(reasoning)
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
        return "".join(text_parts), "".join(reasoning_parts), has_tool

    @staticmethod
    def _usage(value: dict[str, Any]) -> TokenUsage:
        details = value.get("completion_tokens_details") or {}
        return TokenUsage(
            prompt_tokens=value.get("prompt_tokens"),
            completion_tokens=value.get("completion_tokens"),
            total_tokens=value.get("total_tokens"),
            reasoning_tokens=details.get("reasoning_tokens"),
            known=True,
        )
