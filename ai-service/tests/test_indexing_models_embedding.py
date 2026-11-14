"""Embedding 运行时配置与适配器单元测试。

@author 称霸幼儿园
"""

import json

import httpx
import pytest

from models.catalog import ModelCatalogSnapshot, ModelConfigurationError
from models.openai_compatible import OpenAICompatibleAdapter


def _snapshot(egress: bool = True, enabled: bool = True, dims: int | None = 3) -> ModelCatalogSnapshot:
    return ModelCatalogSnapshot(
        version="1:2",
        providers=[
            {
                "providerKey": "openai",
                "displayName": "OpenAI",
                "protocol": "openai_compatible",
                "baseUrl": "https://embed.test/v1",
                "apiKey": "sk-embed",
                "models": ["text-embedding-3-small"],
                "dataEgressAllowed": egress,
                "enabled": True,
            }
        ],
        logicalModels={
            "embedding": {
                "provider": "openai",
                "model": "text-embedding-custom",
                "enabled": enabled,
                "dimensions": dims,
            }
        },
    )


def test_resolve_embedding_allows_free_text_model_and_blocks_egress():
    """Embedding 支持手动输入的模型名并强制校验数据出境许可。"""
    resolved = _snapshot(egress=True, enabled=True, dims=1536).resolve_embedding()
    assert resolved is not None
    provider, model, dims = resolved
    assert provider.provider_key == "openai"
    assert model == "text-embedding-custom"
    assert dims == 1536

    assert _snapshot(egress=False, enabled=False).resolve_embedding() is None

    with pytest.raises(ModelConfigurationError) as captured:
        _snapshot(egress=False, enabled=True).resolve_embedding()
    assert str(captured.value) == "模型供应商未允许数据出境，拒绝发送知识内容进行向量化"


async def test_openai_compatible_embed_batches_and_verifies_dims():
    """embed 按 index 排序向量并在维度不符时拒绝。"""

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/embeddings"
        assert request.headers["Authorization"] == "Bearer sk-embed"
        body = json.loads(request.content.decode())
        assert body["model"] == "text-embedding-custom"
        assert body["dimensions"] in {3, 8}
        return httpx.Response(
            200,
            json={
                "data": [
                    {"index": 1, "embedding": [0.4, 0.5, 0.6]},
                    {"index": 0, "embedding": [0.1, 0.2, 0.3]},
                ]
            },
        )

    adapter = OpenAICompatibleAdapter(
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout)
    )
    vectors = await adapter.embed(_snapshot(dims=3), ["第一段", "第二段"])
    assert vectors == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]

    with pytest.raises(ModelConfigurationError):
        await adapter.embed(_snapshot(dims=8), ["第一段", "第二段"])
