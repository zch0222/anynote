"""Nacos 生命周期与热更新测试。

@author 称霸幼儿园
"""

import asyncio

from clients.nacos import NacosManager, merge_dicts, profile_data_id
from core.config import RuntimeConfigStore, Settings


class FakeNacos:
    instances = []
    watchers = {}
    heartbeats = []

    def __init__(self, **_kwargs):
        self.configs = {
            "anynote-ai-harness.yml": "harness:\n  model-turns: 4\n",
            "anynote-ai-harness-dev.yml": "harness:\n  tool-calls: 7\n",
        }

    def get_config(self, data_id, _group):
        return self.configs.get(data_id)

    def add_config_watcher(self, data_id, _group, callback):
        self.watchers[(data_id, callback)] = True

    def remove_config_watcher(self, data_id, _group, callback):
        self.watchers.pop((data_id, callback), None)

    def add_naming_instance(self, service, host, port, **kwargs):
        self.instances.append((service, host, port, kwargs))

    def send_heartbeat(self, service, host, port, **kwargs):
        self.heartbeats.append((service, host, port, kwargs))

    def remove_naming_instance(self, service, host, port):
        FakeNacos.instances = [item for item in FakeNacos.instances if item[:3] != (service, host, port)]


async def test_register_heartbeat_hot_update_and_deregister(monkeypatch):
    """注册带版本，配置热合并，关闭时移除监听并注销。"""
    monkeypatch.setattr("clients.nacos.nacos.NacosClient", FakeNacos)
    FakeNacos.instances = []
    FakeNacos.watchers = {}
    FakeNacos.heartbeats = []
    settings = Settings(
        NACOS_SERVER_ADDRESS="nacos:8848",
        NACOS_NAMESPACE="dev",
        HOST="harness",
    )
    store = RuntimeConfigStore(settings.runtime_defaults())
    manager = NacosManager(settings, store)
    await manager.start()
    await asyncio.sleep(0.02)
    assert store.get().harness.model_turns == 4
    assert store.get().harness.tool_calls == 7
    assert FakeNacos.instances[0][3]["metadata"] == {"version": "1.0.0"}
    assert FakeNacos.heartbeats
    callback = next(key[1] for key in FakeNacos.watchers if key[0] == "anynote-ai-harness-dev.yml")
    callback({"content": "harness:\n  tool-calls: 9\n"})
    assert store.get().harness.tool_calls == 9
    await manager.close()
    assert not FakeNacos.instances
    assert not FakeNacos.watchers


def test_profile_data_id_and_recursive_merge():
    """profile 文件名与嵌套配置合并保持确定性。"""
    assert profile_data_id("anynote-ai-harness.yml", "prod") == "anynote-ai-harness-prod.yml"
    assert merge_dicts({"a": {"b": 1, "c": 2}}, {"a": {"b": 3}}) == {"a": {"b": 3, "c": 2}}
