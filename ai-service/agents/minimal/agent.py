"""无工具最小 Agent 契约加载。

@author 称霸幼儿园
"""

from pathlib import Path

import yaml

from harness.models import AgentDefinition


def load_minimal_agent() -> AgentDefinition:
    """加载版本化的最小 Agent 契约与指令。

    :return: 最小 Agent 定义
    """
    directory = Path(__file__).resolve().parent
    contract = yaml.safe_load((directory / "agent.yaml").read_text(encoding="utf-8"))
    contract["instructions"] = (directory / "instructions.md").read_text(encoding="utf-8").strip()
    return AgentDefinition.model_validate(contract)
