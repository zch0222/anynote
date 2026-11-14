"""独立 Whisper 进程测试。

@author 称霸幼儿园
"""

from fastapi.testclient import TestClient

from core.config import Settings
from whisper.app import create_whisper_app
from whisper.service import WhisperService


def test_segments_to_srt():
    """Whisper 时间片转换为标准 SRT 时间与序号。"""
    result = WhisperService.segments_to_srt(
        [{"start": 1.25, "end": 65.5, "text": " 你好 "}]
    )
    assert result == "1\n00:00:01,250 --> 00:01:05,500\n你好\n"


def test_whisper_health_and_internal_auth():
    """Whisper 健康检查公开，转写接口要求内部签名。"""
    settings = Settings(NACOS_SERVER_ADDRESS="", NACOS_SERVICE_NAME="anynote-ai-whisper")
    with TestClient(create_whisper_app(settings), raise_server_exceptions=False) as client:
        assert client.get("/healthz").json() == {"status": "UP"}
        response = client.post(
            "/v1/audio/transcriptions",
            json={"file_url": "https://example.com/a.mp3", "model": "turbo"},
        )
    assert response.status_code == 401
    assert response.json()["msg"] == "没有内部访问权限，不允许访问"
