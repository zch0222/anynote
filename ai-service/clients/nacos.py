"""Nacos 注册、心跳、注销与配置监听。

@author 称霸幼儿园
"""

import asyncio
from collections.abc import Callable
from threading import Lock

import nacos
import yaml

from core.config import RuntimeConfigStore, RuntimeSettings, Settings
from core.logger import get_logger


def profile_data_id(base_data_id: str, profile: str) -> str:
    """生成与 Java 配置命名一致的 profile Data ID。

    :param base_data_id: 基础 Data ID
    :param profile: 运行环境名称
    :return: profile Data ID
    """
    if base_data_id.endswith(".yml"):
        return f"{base_data_id[:-4]}-{profile}.yml"
    return f"{base_data_id}-{profile}"


def merge_dicts(base: dict, override: dict) -> dict:
    """递归合并非敏感配置字典。

    :param base: 基础配置
    :param override: 覆盖配置
    :return: 合并后的新字典
    """
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = merge_dicts(merged[key], value)
        else:
            merged[key] = value
    return merged


class NacosManager:
    """管理一个 FastAPI 进程的 Nacos 生命周期。

    @author 称霸幼儿园
    """

    def __init__(self, settings: Settings, config_store: RuntimeConfigStore):
        self._settings = settings
        self._config_store = config_store
        self._client: nacos.NacosClient | None = None
        self._heartbeat_task: asyncio.Task | None = None
        self._watchers: list[tuple[str, Callable]] = []
        self._configs: dict[str, dict] = {}
        self._config_lock = Lock()
        self._logger = get_logger(__name__)

    @property
    def enabled(self) -> bool:
        """返回是否配置了 Nacos 地址。

        :return: 已配置返回 true
        """
        return bool(self._settings.NACOS_SERVER_ADDRESS.strip())

    async def start(self) -> None:
        """加载配置、注册实例并启动心跳与监听。"""
        if not self.enabled:
            self._logger.warning("Nacos 地址未配置，跳过服务注册")
            return
        self._client = nacos.NacosClient(
            server_addresses=self._settings.NACOS_SERVER_ADDRESS,
            namespace=self._settings.NACOS_NAMESPACE,
            logDir=f"{self._settings.DATA_PATH}/nacos",
        )
        self._client.snapshot_base = f"{self._settings.DATA_PATH}/nacos-data/snapshot"
        self._client.failover_base = f"{self._settings.DATA_PATH}/nacos-data/data"
        for data_id in self._data_ids():
            content = await asyncio.to_thread(
                self._client.get_config,
                data_id,
                self._settings.NACOS_CONFIG_GROUP,
            )
            self._accept_content(data_id, content)
            callback = self._config_callback(data_id)
            await asyncio.to_thread(
                self._client.add_config_watcher,
                data_id,
                self._settings.NACOS_CONFIG_GROUP,
                callback,
            )
            self._watchers.append((data_id, callback))
        await asyncio.to_thread(
            self._client.add_naming_instance,
            self._settings.NACOS_SERVICE_NAME,
            self._settings.HOST,
            self._settings.PORT,
            metadata={"version": self._settings.APP_VERSION},
            ephemeral=True,
        )
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def close(self) -> None:
        """停止监听和心跳，并注销当前实例。"""
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
        if not self._client:
            return
        for data_id, callback in self._watchers:
            await asyncio.to_thread(
                self._client.remove_config_watcher,
                data_id,
                self._settings.NACOS_CONFIG_GROUP,
                callback,
            )
        self._watchers.clear()
        await asyncio.to_thread(
            self._client.remove_naming_instance,
            self._settings.NACOS_SERVICE_NAME,
            self._settings.HOST,
            self._settings.PORT,
        )
        self._client = None

    def _data_ids(self) -> list[str]:
        base = self._settings.NACOS_CONFIG_DATA_ID
        return [base, profile_data_id(base, self._settings.APP_PROFILE)]

    def _config_callback(self, data_id: str) -> Callable:
        def callback(args: dict) -> None:
            self._accept_content(data_id, args.get("content"))

        return callback

    def _accept_content(self, data_id: str, content: str | None) -> None:
        if not content:
            return
        try:
            parsed = yaml.safe_load(content) or {}
            if not isinstance(parsed, dict):
                raise ValueError("Nacos 配置根节点必须是对象")
            with self._config_lock:
                self._configs[data_id] = parsed
                combined: dict = {}
                for current_id in self._data_ids():
                    combined = merge_dicts(combined, self._configs.get(current_id, {}))
            self._config_store.update(RuntimeSettings.model_validate(combined))
        except Exception as error:
            self._logger.error("忽略无效的 Nacos 配置 dataId=%s: %s", data_id, error)

    async def _heartbeat_loop(self) -> None:
        while True:
            if self._client:
                await asyncio.to_thread(
                    self._client.send_heartbeat,
                    self._settings.NACOS_SERVICE_NAME,
                    self._settings.HOST,
                    self._settings.PORT,
                    metadata={"version": self._settings.APP_VERSION},
                )
            await asyncio.sleep(10)
