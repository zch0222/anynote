"""外部客户端测试。

@author 称霸幼儿园
"""

import httpx

from clients.model_provider import ModelProviderClient
from core.auth import sign_timestamp
from core.config import Settings


async def test_provider_snapshot_uses_internal_signature_and_parses_secret():
    """供应商快照请求带内部签名，明文凭据仅在内存模型中使用。"""
    observed = {}

    def handler(request):
        observed["source"] = request.headers.get("from-source")
        observed["timestamp"] = request.headers.get("x-internal-timestamp")
        observed["signature"] = request.headers.get("x-internal-sign")
        return httpx.Response(
            200,
            json={
                "code": "00000",
                "data": {
                    "version": "1:1",
                    "providers": [
                        {
                            "providerKey": "openai",
                            "displayName": "OpenAI",
                            "protocol": "openai_compatible",
                            "baseUrl": "https://api.openai.com/v1",
                            "apiKey": "sk-test",
                            "models": ["gpt-4o"],
                            "dataEgressAllowed": True,
                            "enabled": True,
                        }
                    ],
                    "logicalModels": {},
                },
            },
        )

    settings = Settings(ANYNOTE_INTERNAL_SECRET="secret", AI_SERVICE_URL="http://ai:9065")
    client = ModelProviderClient(
        settings,
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout),
    )
    result = await client.snapshot()
    assert observed["source"] == "inner"
    assert observed["signature"] == sign_timestamp("secret", observed["timestamp"])
    assert result.version == "1:1"
    assert result.providers[0].api_key.get_secret_value() == "sk-test"
    assert "sk-test" not in repr(result.providers[0])
