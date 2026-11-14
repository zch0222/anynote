"""运行管理器取消与终态测试。

@author 称霸幼儿园
"""

import asyncio

from core.config import RuntimeConfigStore, Settings
from harness.models import RunRequest, RunState
from harness.runtime import RunManager
from models.catalog import ModelCatalogSnapshot
from models.scripted import ScriptedModel, ScriptStep


class Providers:
    async def snapshot(self):
        return ModelCatalogSnapshot(version="0:0")


async def test_cancel_active_run_is_accepted_once():
    """活跃运行接受取消，取消后的重复请求返回原终态。"""
    settings = Settings(NACOS_SERVER_ADDRESS="")
    manager = RunManager(
        settings,
        RuntimeConfigStore(settings.runtime_defaults()),
        Providers(),
        ScriptedModel([ScriptStep(delay_s=10)]),
    )
    session = await manager.create(RunRequest(run_id="cancel-1", input="问题"), "token")
    await asyncio.sleep(0.01)
    accepted = await manager.cancel("cancel-1")
    await session.task
    repeated = await manager.cancel("cancel-1")
    assert accepted == {"runId": "cancel-1", "accepted": True, "state": "CANCELLED"}
    assert repeated["accepted"] is False
    assert repeated["state"] == RunState.CANCELLED.value
    await manager.close()
