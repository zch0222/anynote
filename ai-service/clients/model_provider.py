"""Java 模型供应商快照客户端。

@author 称霸幼儿园
"""

import time

import httpx

from core.auth import sign_timestamp
from core.config import Settings
from models.catalog import ModelCatalogSnapshot, ModelConfigurationError


class ModelProviderClient:
    """通过内部签名读取 Java 供应商快照。

    @author 称霸幼儿园
    """

    def __init__(self, settings: Settings, client_factory=None):
        self._settings = settings
        self._client_factory = client_factory or httpx.AsyncClient

    async def snapshot(self) -> ModelCatalogSnapshot:
        """读取当前供应商和逻辑模型快照。

        :return: 模型目录快照
        """
        timestamp = str(int(time.time() * 1000))
        secret = self._settings.ANYNOTE_INTERNAL_SECRET.get_secret_value()
        try:
            async with self._client_factory(timeout=3.0) as client:
                response = await client.get(
                    f"{self._settings.AI_SERVICE_URL.rstrip('/')}/internal/v1/model-providers/snapshot",
                    headers={
                        "from-source": "inner",
                        "X-Internal-Timestamp": timestamp,
                        "X-Internal-Sign": sign_timestamp(secret, timestamp),
                    },
                )
            if response.status_code != 200:
                raise ModelConfigurationError()
            envelope = response.json()
            if envelope.get("code") != "00000":
                raise ModelConfigurationError()
            return ModelCatalogSnapshot.model_validate(envelope["data"])
        except (httpx.HTTPError, ValueError, KeyError) as error:
            raise ModelConfigurationError() from error
