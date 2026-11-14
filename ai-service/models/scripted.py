"""供确定性测试使用的脚本化假模型。

@author 称霸幼儿园
"""

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from core.config import HarnessRuntimeSettings
from harness.models import ModelChunk
from models.catalog import ModelCatalogSnapshot


@dataclass
class ScriptStep:
    """一次模型调用的预设行为。"""

    chunks: list[ModelChunk] = field(default_factory=list)
    delay_s: float = 0
    error: Exception | None = None


class ScriptedModel:
    """按调用顺序播放预设输出。

    @author 称霸幼儿园
    """

    def __init__(self, steps: list[ScriptStep]):
        self._steps = list(steps)
        self.calls: list[dict[str, Any]] = []

    async def stream(
        self,
        logical_name: str,
        snapshot: ModelCatalogSnapshot,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        runtime: HarnessRuntimeSettings,
        contains_knowledge: bool,
    ) -> AsyncIterator[ModelChunk]:
        """播放一次脚本调用。

        :param logical_name: 逻辑模型名
        :param snapshot: 模型快照
        :param messages: 模型输入
        :param tools: 工具定义
        :param runtime: 运行参数
        :param contains_knowledge: 是否含知识库内容
        :return: 预设输出序列
        """
        index = len(self.calls)
        self.calls.append(
            {
                "logicalName": logical_name,
                "messages": messages,
                "tools": tools,
                "containsKnowledge": contains_knowledge,
            }
        )
        if index >= len(self._steps):
            raise AssertionError("脚本化模型没有剩余步骤")
        step = self._steps[index]
        if step.delay_s:
            await asyncio.sleep(step.delay_s)
        if step.error:
            raise step.error
        for chunk in step.chunks:
            await asyncio.sleep(0)
            yield chunk
