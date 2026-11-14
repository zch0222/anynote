"""模型接入接口。

@author 称霸幼儿园
"""

from collections.abc import AsyncIterator
from typing import Any, Protocol

from core.config import HarnessRuntimeSettings
from harness.models import ModelChunk
from models.catalog import ModelCatalogSnapshot


class ChatModel(Protocol):
    """流式对话模型接口。"""

    def stream(
        self,
        logical_name: str,
        snapshot: ModelCatalogSnapshot,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        runtime: HarnessRuntimeSettings,
        contains_knowledge: bool,
    ) -> AsyncIterator[ModelChunk]:
        """按逻辑模型名发起流式调用。"""
