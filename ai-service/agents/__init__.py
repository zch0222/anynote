"""版本化 Agent 契约。"""

from harness.models import AgentDefinition

from agents.knowledge_retrieval.agent import load_knowledge_retrieval_agent
from agents.minimal.agent import load_minimal_agent


def load_agent(name: str) -> AgentDefinition:
    """按名称加载 Agent 契约。

    :param name: Agent 名称
    :return: Agent 定义
    """
    loaders = {
        "minimal": load_minimal_agent,
        "knowledge-retrieval": load_knowledge_retrieval_agent,
    }
    loader = loaders.get(name)
    if loader is None:
        raise ValueError(f"unknown agent: {name}")
    return loader()
