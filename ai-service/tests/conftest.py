"""Harness 测试公共构造器。

@author 称霸幼儿园
"""

from agents.minimal.agent import load_minimal_agent
from core.config import HarnessRuntimeSettings
from harness.context.builder import ContextBuilder
from harness.events import EventBus
from harness.loop import Harness
from harness.models import AgentDefinition, RunContext, RunRequest
from models.catalog import ModelCatalogSnapshot


class CharacterCounter:
    """测试用字符计数器。"""

    def count(self, content: str) -> int:
        return len(content)


def make_run(
    tools: list[str] | None = None,
    runtime: HarnessRuntimeSettings | None = None,
    history=None,
) -> RunContext:
    """构造一次假模型运行。

    :param tools: Agent 可用工具
    :param runtime: 测试预算与超时
    :param history: 会话历史
    :return: 运行上下文
    """
    agent = load_minimal_agent()
    if tools:
        agent = AgentDefinition(
            **{
                **agent.model_dump(),
                "tools": tools,
            }
        )
    request = RunRequest(run_id="run-test", input="测试问题", history=history or [])
    return RunContext(
        request=request,
        agent=agent,
        runtime=runtime or HarnessRuntimeSettings(),
        model_snapshot=ModelCatalogSnapshot(version="0:0"),
        access_token="secret-user-token",
    )


def make_harness(model, registry=None, middlewares=None, verifier=None) -> Harness:
    """构造使用字符计数的 Harness。

    :param model: 脚本化模型
    :param registry: 工具注册表
    :param middlewares: 自定义中间件
    :param verifier: 验证器
    :return: Harness 实例
    """
    return Harness(
        model,
        registry=registry,
        middlewares=middlewares,
        verifier=verifier,
        context_builder=ContextBuilder(model, CharacterCounter()),
    )


async def collect_events(harness: Harness, run: RunContext):
    """执行运行并收集全部事件。

    :param harness: Harness 实例
    :param run: 运行上下文
    :return: 事件列表
    """
    bus = EventBus(run.run_id, heartbeat_interval_s=0.01)
    await harness.run(run, bus)
    await bus.close()
    return [event async for event in bus.events()]
