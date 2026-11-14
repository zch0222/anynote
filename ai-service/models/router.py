"""逻辑模型路由器。

@author 称霸幼儿园
"""

from collections.abc import AsyncIterator
from typing import Any

from core.config import HarnessRuntimeSettings
from harness.models import ModelChunk
from models.base import ChatModel
from models.catalog import ModelCatalogSnapshot
from models.openai_compatible import OpenAICompatibleAdapter


class ModelRouter:
    """把 Agent 逻辑名路由到协议适配器。

    @author 称霸幼儿园
    """

    def __init__(self, adapter: OpenAICompatibleAdapter | None = None):
        self._adapter = adapter or OpenAICompatibleAdapter()

    def stream(
        self,
        logical_name: str,
        snapshot: ModelCatalogSnapshot,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        runtime: HarnessRuntimeSettings,
        contains_knowledge: bool,
    ) -> AsyncIterator[ModelChunk]:
        """调用逻辑模型。

        :param logical_name: 逻辑模型名
        :param snapshot: 运行配置快照
        :param messages: 模型输入
        :param tools: 工具定义
        :param runtime: 运行参数
        :param contains_knowledge: 是否包含知识库内容
        :return: 模型输出异步序列
        """
        return self._adapter.stream(
            logical_name,
            snapshot,
            messages,
            tools,
            runtime,
            contains_knowledge,
        )
