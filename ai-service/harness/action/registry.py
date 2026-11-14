"""工具注册表与定义。

@author 称霸幼儿园
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from harness.models import EvidenceItem


@dataclass(frozen=True)
class ToolOutput:
    """工具实现返回的结果。"""

    content: str
    evidence: list[EvidenceItem] | None = None
    partial: bool = False


@dataclass(frozen=True)
class ToolSpec:
    """工具的静态能力与边界。"""

    name: str
    summary: str
    description: str
    args_model: type[BaseModel]
    handler: Callable[[BaseModel, Any], Awaitable[ToolOutput]]
    read_only: bool = True
    timeout_s: float | None = None
    result_max_chars: int = 2000

    def definition(self) -> dict[str, Any]:
        """生成 OpenAI 兼容工具定义。

        :return: 工具定义字典
        """
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.args_model.model_json_schema(),
            },
        }


class ToolRegistry:
    """按名称管理本次进程可用的工具。

    @author 称霸幼儿园
    """

    def __init__(self):
        self._tools: dict[str, ToolSpec] = {}

    def register(self, spec: ToolSpec) -> None:
        """注册唯一工具。

        :param spec: 工具定义与处理器
        """
        if spec.name in self._tools:
            raise ValueError(f"duplicate tool: {spec.name}")
        self._tools[spec.name] = spec

    def get(self, name: str) -> ToolSpec | None:
        """按名称读取工具。

        :param name: 工具名
        :return: 工具定义或空值
        """
        return self._tools.get(name)

    def definitions(self, names: list[str]) -> list[dict[str, Any]]:
        """只导出本次运行明确授权的工具。

        :param names: Agent 契约中的工具名
        :return: OpenAI 工具定义列表
        """
        return [self._tools[name].definition() for name in names if name in self._tools]
