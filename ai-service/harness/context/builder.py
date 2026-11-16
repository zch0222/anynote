"""确定性 Context Builder 与分层编译。

@author 称霸幼儿园
"""

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

import tiktoken

from harness.action.preview import structured_preview
from harness.budget import FORCE_FINISH_HINT
from harness.context.compaction import HistoryCompactor
from harness.context.manifest import ContextManifest, ManifestEntry
from harness.context.policy import EVIDENCE_BEGIN, EVIDENCE_END, PLATFORM_RULES
from harness.models import ChatMessage, RunContext, TokenUsage, ToolExchange
from models.base import ChatModel


class TokenCounter(Protocol):
    """token 计数接口。"""

    def count(self, content: str) -> int:
        """计算文本 token 数。"""


class TiktokenCounter:
    """使用固定 o200k_base 编码计数。

    @author 称霸幼儿园
    """

    def __init__(self):
        self._encoding = tiktoken.get_encoding("o200k_base")

    def count(self, content: str) -> int:
        """计算文本 token 数。

        :param content: 文本
        :return: token 数
        """
        return len(self._encoding.encode(content))


@dataclass
class CompiledContext:
    """一次模型调用的编译结果。"""

    messages: list[dict[str, Any]]
    manifest: ContextManifest
    token_count: int
    tools: list[dict[str, Any]]
    additional_usage: TokenUsage


@dataclass
class _Layer:
    scope: str
    source_type: str
    source_id: str
    content: str
    trust_level: str
    version: str
    selected_reason: str
    transform: str = "ORIGINAL"
    permission_basis: str | None = None
    referenced_content: str | None = None


class ContextBuilder:
    """按固定优先级收集、压缩并编译模型输入。

    @author 称霸幼儿园
    """

    def __init__(self, model: ChatModel, token_counter: TokenCounter | None = None):
        self._counter = token_counter or TiktokenCounter()
        self._compactor = HistoryCompactor(model)

    async def build(
        self,
        run: RunContext,
        tools: list[dict[str, Any]],
    ) -> CompiledContext:
        """构建本轮模型输入与清单。

        :param run: 当前运行
        :param tools: 本轮工具定义
        :return: 编译后的上下文
        """
        additional_usage = TokenUsage()
        history = list(run.history) if run.agent.context_policy.get("history_enabled", True) else []
        if len(history) > run.runtime.history_compaction_threshold:
            split = len(history) - run.runtime.history_recent_messages
            summary, additional_usage = await self._compactor.compact(run, history[:split])
            history = [summary, *history[split:]]
            run.history = list(history)
        active_hints = list(run.budget_hints)
        if run.force_finish:
            active_hints.append(FORCE_FINISH_HINT)
        active_hints.extend(run.hints)
        run.last_hints = list(active_hints)
        run.hints.clear()
        high = self._fixed_layers(run, tools, active_hints)
        history_layers = [self._history_layer(index, item) for index, item in enumerate(history)]
        # 结构化行（清单、目录、关系）已带 evidenceId 出现在工具结果里，不再以证据层重复发送
        evidence_layers = [
            self._evidence_layer(run, item) for item in run.workspace.evidence if not item.structured
        ]
        high.append(
            _Layer(
                scope="run",
                source_type="question",
                source_id=f"{run.run_id}:input",
                content=run.request.input,
                trust_level="USER_INPUT",
                version="1",
                selected_reason="本轮输入",
            )
        )
        fixed_tokens = sum(self._counter.count(item.content) for item in high)
        remaining = max(0, run.runtime.context_tokens - fixed_tokens)
        exchange_messages, exchange_layers = self._exchange_messages(run.tool_exchanges, remaining // 2)
        remaining = max(0, remaining - sum(self._counter.count(item.content) for item in exchange_layers))
        history_budget = remaining * 3 // 10
        evidence_budget = remaining - history_budget
        selected_history = self._fit_layers(history_layers, history_budget, reverse=True)
        selected_evidence = self._fit_layers(evidence_layers, evidence_budget)
        selected_history.reverse()
        selected = [*high, *selected_history, *selected_evidence, *exchange_layers]
        messages = self._compile_messages(high, selected_history, selected_evidence)
        messages.extend(exchange_messages)
        token_count = self._counter.count(json.dumps(messages, ensure_ascii=False))
        manifest = ContextManifest(
            run_id=run.run_id,
            model_turn=run.model_turns + 1,
            entries=[self._manifest_entry(item) for item in selected],
            token_count=token_count,
        )
        return CompiledContext(messages, manifest, token_count, tools, additional_usage)

    def _fixed_layers(
        self,
        run: RunContext,
        tools: list[dict[str, Any]],
        active_hints: list[str],
    ) -> list[_Layer]:
        runtime = {
            "date": datetime.now(UTC).date().isoformat(),
            "scope": run.request.scope.model_dump(by_alias=True) if run.request.scope else None,
            "contextPolicy": run.agent.context_policy,
            "modelTurnsRemaining": max(0, run.runtime.model_turns - run.model_turns),
            "toolCallsRemaining": max(0, run.runtime.tool_calls - run.tool_calls),
            "hints": active_hints,
        }
        return [
            _Layer("platform", "platform", "platform-rules", PLATFORM_RULES, "PLATFORM", "1", "平台规则"),
            _Layer("agent", "agent", run.agent.name, run.agent.instructions, "PLATFORM", run.agent.version, "Agent 契约"),
            _Layer("run", "runtime", run.run_id, json.dumps(runtime, ensure_ascii=False), "SYSTEM_GENERATED", "1", "运行状态"),
            _Layer(
                "run",
                "tools",
                run.agent.name,
                "",
                "PLATFORM",
                run.agent.version,
                "行动面工具定义",
                transform="REFERENCE",
                referenced_content=json.dumps(tools, ensure_ascii=False),
            ),
        ]

    @staticmethod
    def _history_layer(index: int, message: ChatMessage) -> _Layer:
        return _Layer(
            scope="conversation",
            source_type="history",
            source_id=f"history:{index}",
            content=f"{message.role}: {message.content}",
            trust_level="USER_INPUT",
            version="1",
            selected_reason="会话历史",
            transform="SUMMARY" if message.content.startswith("[历史摘要]") else "ORIGINAL",
        )

    @staticmethod
    def _evidence_layer(run: RunContext, item) -> _Layer:
        content = item.content
        transform = "ORIGINAL"
        if len(content) > run.runtime.large_result_chars:
            reference = run.workspace.put_result(content)
            content = f"{content[:run.runtime.large_result_preview_chars]}\n完整结果引用: {reference}"
            transform = "REFERENCE"
        return _Layer(
            scope="run",
            source_type=item.source_type,
            source_id=item.source_id,
            content=f"证据 {item.evidence_id}\n{EVIDENCE_BEGIN}\n{content}\n{EVIDENCE_END}",
            trust_level="UNTRUSTED_CONTENT",
            version=item.version or "unknown",
            selected_reason=item.selected_reason or "检索命中",
            transform=transform,
            permission_basis=item.permission_basis,
        )

    def _exchange_messages(
        self,
        exchanges: list[ToolExchange],
        budget: int,
    ) -> tuple[list[dict[str, Any]], list[_Layer]]:
        """把本次运行的工具交互编译为 assistant tool_calls 与 tool 消息。

        预算不足时从最早一轮开始收缩 tool 消息内容，调用与结果始终成对保留；
        JSON 对象结果按条目收缩并保留 count 等元数据，其他结果按字符截取。

        :param exchanges: 按轮记录的工具交互
        :param budget: 工具交互可用的 token 预算
        :return: 消息列表与对应的清单层
        """
        call_layers: list[_Layer] = []
        result_entries: list[tuple[str, str, str, str]] = []
        for exchange in exchanges:
            for call in exchange.calls:
                call_layers.append(
                    _Layer(
                        scope="run",
                        source_type="tool_call",
                        source_id=call.call_id,
                        content=json.dumps(call.arguments, ensure_ascii=False, sort_keys=True),
                        trust_level="SYSTEM_GENERATED",
                        version="1",
                        selected_reason=f"模型发起的工具调用 {call.name}",
                    )
                )
                observation = next(
                    (item for item in exchange.observations if item.call_id == call.call_id),
                    None,
                )
                content = observation.content if observation else ""
                reference = ""
                if observation and observation.result_ref:
                    reference = f"\n完整结果引用: {observation.result_ref}"
                result_entries.append((call.call_id, call.name, content, reference))
        call_tokens = sum(self._counter.count(item.content) for item in call_layers)
        overflow = sum(
            self._counter.count(content + reference) for _call_id, _name, content, reference in result_entries
        ) - max(0, budget - call_tokens)
        fitted: list[tuple[str, str, str, str]] = []
        for call_id, name, content, reference in result_entries:
            full, transform = content + reference, "ORIGINAL"
            if overflow > 0:
                tokens = self._counter.count(full)
                target = tokens - overflow - self._counter.count(reference)
                kept = self._fit_tool_result(content, target) + reference if target > 0 else ""
                overflow -= tokens - self._counter.count(kept)
                if kept != full:
                    full, transform = kept, "TRUNCATED"
            fitted.append((call_id, name, full, transform))
        results = {call_id: (name, content, transform) for call_id, name, content, transform in fitted}
        messages: list[dict[str, Any]] = []
        layers: list[_Layer] = []
        for exchange in exchanges:
            if not exchange.calls:
                continue
            messages.append(
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": call.call_id,
                            "type": "function",
                            "function": {
                                "name": call.name,
                                "arguments": json.dumps(call.arguments, ensure_ascii=False),
                            },
                        }
                        for call in exchange.calls
                    ],
                }
            )
            for call in exchange.calls:
                name, content, transform = results[call.call_id]
                wrapped = f"{EVIDENCE_BEGIN}\n{content}\n{EVIDENCE_END}"
                messages.append({"role": "tool", "tool_call_id": call.call_id, "content": wrapped})
                layers.append(
                    _Layer(
                        scope="run",
                        source_type="tool_result",
                        source_id=call.call_id,
                        content=wrapped,
                        trust_level="UNTRUSTED_CONTENT",
                        version="1",
                        selected_reason=f"工具 {name} 的观察",
                        transform=transform,
                    )
                )
        return messages, [*call_layers, *layers]

    def _fit_layers(self, layers: list[_Layer], budget: int, reverse: bool = False) -> list[_Layer]:
        selected = []
        remaining = budget
        ordered = reversed(layers) if reverse else layers
        for layer in ordered:
            tokens = self._counter.count(layer.content)
            if tokens <= remaining:
                selected.append(layer)
                remaining -= tokens
                continue
            if remaining <= 0:
                continue
            content = self._truncate(layer.content, remaining)
            if not content:
                continue
            selected.append(
                _Layer(
                    **{
                        **layer.__dict__,
                        "content": content,
                        "transform": "TRUNCATED",
                    }
                )
            )
            break
        return selected

    def _fit_tool_result(self, content: str, budget: int) -> str:
        """把工具结果收进 token 预算：能做结构化预览时取放得下的最大预览，否则按字符截取。

        :param content: 工具结果（不含完整结果引用）
        :param budget: token 预算
        :return: 收缩后的结果
        """
        if self._counter.count(content) <= budget:
            return content
        best = None
        low, high = 0, len(content)
        while low <= high:
            middle = (low + high) // 2
            preview = structured_preview(content, middle)
            if preview is not None and self._counter.count(preview) <= budget:
                best, low = preview, middle + 1
            else:
                high = middle - 1
        return best if best is not None else self._truncate(content, budget)

    def _truncate(self, content: str, budget: int) -> str:
        if self._counter.count(content) <= budget:
            return content
        low, high = 0, len(content)
        while low < high:
            middle = (low + high + 1) // 2
            if self._counter.count(content[:middle]) <= budget:
                low = middle
            else:
                high = middle - 1
        return content[:low]

    @staticmethod
    def _compile_messages(
        high: list[_Layer],
        history: list[_Layer],
        evidence: list[_Layer],
    ) -> list[dict[str, Any]]:
        question = high[-1]
        instructions = "\n\n".join(item.content for item in high[:-1] if item.content)
        messages: list[dict[str, Any]] = [{"role": "system", "content": instructions}]
        messages.extend({"role": "user", "content": item.content} for item in history)
        if evidence:
            messages.append(
                {"role": "user", "content": "\n\n".join(item.content for item in evidence)}
            )
        messages.append({"role": "user", "content": question.content})
        return messages

    def _manifest_entry(self, layer: _Layer) -> ManifestEntry:
        content = layer.referenced_content if layer.referenced_content is not None else layer.content
        return ManifestEntry(
            source_type=layer.source_type,
            source_id=layer.source_id,
            scope=layer.scope,
            version=layer.version,
            trust_level=layer.trust_level,
            permission_basis=layer.permission_basis,
            selected_reason=layer.selected_reason,
            token_count=self._counter.count(content),
            transform=layer.transform,
            content_hash=hashlib.sha256(content.encode("utf-8")).hexdigest(),
        )
