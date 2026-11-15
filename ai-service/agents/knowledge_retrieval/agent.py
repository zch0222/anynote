"""知识检索 Agent 的版本化契约加载器。

@author 称霸幼儿园
"""

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

from harness.models import AgentDefinition


class CitationQuote(BaseModel):
    """Agent 为一个引用编号提供的原文片段。

    @author 称霸幼儿园
    """

    index: int = Field(ge=1)
    quote: str = Field(min_length=1, max_length=1000)

    model_config = ConfigDict(extra="forbid")


class AgentFinishArgs(BaseModel):
    """知识检索 Agent 的机器可读终态信号。

    @author 称霸幼儿园
    """

    outcome: Literal["ANSWERED", "NOT_FOUND", "NEEDS_CLARIFICATION"]
    citations: list[CitationQuote] = Field(default_factory=list, max_length=50)
    clarification_question: str | None = Field(default=None, max_length=1000)

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


def load_knowledge_retrieval_agent() -> AgentDefinition:
    """加载知识检索 Agent 契约、指令与上下文策略。

    :return: 知识检索 Agent 定义
    """
    directory = Path(__file__).resolve().parent
    contract = yaml.safe_load((directory / "agent.yaml").read_text(encoding="utf-8"))
    contract["instructions"] = (directory / "instructions.md").read_text(encoding="utf-8").strip()
    contract["context_policy"] = yaml.safe_load(
        (directory / "context_policy.yaml").read_text(encoding="utf-8")
    )
    return AgentDefinition.model_validate(contract)


def finish_tool_definition() -> dict:
    """生成供模型传递终态的结构化工具定义。

    :return: OpenAI 兼容工具定义
    """
    return {
        "type": "function",
        "function": {
            "name": "agent_finish",
            "description": "提交知识检索 Agent 的机器可读终态。",
            "parameters": AgentFinishArgs.model_json_schema(),
        },
    }
