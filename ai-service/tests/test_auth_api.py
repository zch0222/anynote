"""内部鉴权、运行 HTTP 契约与健康检查测试。

@author 称霸幼儿园
"""

import json
import time

from fastapi.testclient import TestClient

from app import create_app
from core.auth import sign_timestamp
from core.config import Settings
from harness.models import ModelChunk
from models.catalog import ModelCatalogSnapshot
from models.scripted import ScriptedModel, ScriptStep

SECRET = "anynote-shared-test-vector-secret"


class FakeProviders:
    async def snapshot(self):
        return ModelCatalogSnapshot(version="0:0")


def settings():
    return Settings(
        ANYNOTE_INTERNAL_SECRET=SECRET,
        NACOS_SERVER_ADDRESS="",
        AI_SERVICE_URL="http://unused",
    )


def signed_headers(token="user-token", timestamp=None):
    timestamp = timestamp or str(int(time.time() * 1000))
    return {
        "from-source": "inner",
        "X-Internal-Timestamp": timestamp,
        "X-Internal-Sign": sign_timestamp(SECRET, timestamp),
        "accessToken": token,
    }


def client():
    app = create_app(
        settings(),
        ScriptedModel([ScriptStep([ModelChunk(text_delta="完成", finish=True)])]),
        FakeProviders(),
    )
    return TestClient(app, raise_server_exceptions=False)


def test_cross_language_hmac_vector():
    """Python 签名与 Java、协同服务共用测试向量一致。"""
    assert sign_timestamp("anynote-shared-test-vector-secret", "1790265600000") == (
        "XJ2VScsXMnbKvXkZmlWkkgIRHO6sxRvuh6WcNmwUpCM="
    )


def test_health_and_missing_internal_signature():
    """健康检查公开，无内部签名的运行请求被拒绝。"""
    with client() as current:
        assert current.get("/healthz").json() == {"status": "UP"}
        response = current.post("/internal/v1/runs", json={"runId": "r1", "input": "问题"})
    assert response.status_code == 401
    assert response.json()["msg"] == "没有内部访问权限，不允许访问"


def test_invalid_signature_and_missing_user_token():
    """错误签名和缺少用户令牌分别返回已确认文案。"""
    with client() as current:
        headers = signed_headers()
        headers["X-Internal-Sign"] = "invalid"
        invalid = current.post(
            "/internal/v1/runs",
            json={"runId": "r1", "input": "问题"},
            headers=headers,
        )
        assert invalid.status_code == 401
        assert invalid.json()["msg"] == "内部调用签名验证失败"
        missing = current.post(
            "/internal/v1/runs",
            json={"runId": "r1", "input": "问题"},
            headers=signed_headers(token=""),
        )
        assert missing.status_code == 401
        assert missing.json()["msg"] == "没有设置用户信息，不允许访问"


def test_run_sse_envelope_and_validation_error():
    """合法运行返回单调事件，参数错误不进入模型。"""
    with client() as current:
        with current.stream(
            "POST",
            "/internal/v1/runs",
            json={"runId": "r1", "input": "问题"},
            headers=signed_headers(),
        ) as response:
            frames = list(response.iter_lines())
        events = [
            json.loads(line[5:].strip())
            for line in frames
            if line.startswith("data:")
        ]
        assert [event["seq"] for event in events] == list(range(1, len(events) + 1))
        assert any(event["type"] == "text.delta" and event["data"]["delta"] == "完成" for event in events)
        assert events[-1]["type"] == "run.finished"
        assert events[-1]["data"]["outcome"] == "ANSWERED"
        invalid = current.post(
            "/internal/v1/runs",
            json={"runId": "r2", "input": ""},
            headers=signed_headers(),
        )
        assert invalid.status_code == 400
        assert invalid.json()["msg"] == "请求参数错误"


def test_cancel_unknown_run_and_old_routes_removed():
    """取消未知运行返回 A0404，旧 Python 路由不再存在。"""
    with client() as current:
        response = current.post("/internal/v1/runs/missing/cancel", headers=signed_headers())
        assert response.status_code == 404
        assert response.json()["msg"] == "运行不存在"
        schema = current.get("/v3/api-docs").json()
        assert "/v1/chat/completions" not in schema["paths"]
        assert "/api/rag/query/v2" not in schema["paths"]
