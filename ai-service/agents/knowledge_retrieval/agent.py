"""知识检索 Agent 的版本化契约加载器。

@author 称霸幼儿园
"""

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

from harness.models import AgentDefinition


ANSWER_MAX_CHARS = 8000


class CitationQuote(BaseModel):
    """Agent 为一个引用编号提供的原文片段。

    @author 称霸幼儿园
    """

    index: int = Field(ge=1, description="证据编号 n，对应工具结果里的 evidenceId E<n>")
    quote: str = Field(
        default="",
        max_length=1000,
        description="引用正文、字幕或资料片段时，填该证据里逐字出现的一小段原文；清单、目录、关系类证据可留空",
    )

    model_config = ConfigDict(extra="forbid")


class AgentFinishArgs(BaseModel):
    """知识检索 Agent 的机器可读终态信号；回答正文也由它提交。

    @author 称霸幼儿园
    """

    outcome: Literal["ANSWERED", "NOT_FOUND", "NEEDS_CLARIFICATION"] = Field(
        description="ANSWERED 已作答；NOT_FOUND 换过检索方式仍无相关结果；NEEDS_CLARIFICATION 需要用户先澄清",
    )
    answer: str | None = Field(
        default=None,
        max_length=ANSWER_MAX_CHARS,
        description="outcome 为 ANSWERED 时给用户的完整回答（Markdown），来自知识库的事实后用 [n] 标注；"
        "回答已写在本条回复正文里时可以省略",
    )
    citations: list[CitationQuote] = Field(
        default_factory=list,
        max_length=50,
        description="answer 里每个 [n] 对应的证据",
    )
    clarification_question: str | None = Field(
        default=None,
        max_length=1000,
        description="outcome 为 NEEDS_CLARIFICATION 时必填：唯一的澄清问题",
    )

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
            "description": "结束本次运行并提交结果：终态、引用，以及回答（也可以写在本条回复正文里）。",
            "parameters": AgentFinishArgs.model_json_schema(),
        },
    }
