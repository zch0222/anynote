"""索引 Worker CLI、密钥校验、/healthz 探针与守护循环测试。

@author 称霸幼儿园
"""

import asyncio

import httpx
import pytest

from core.config import RuntimeConfigStore, Settings
from indexing.models import MISSING_INTERNAL_SECRET_MESSAGE
from worker import HealthProbeServer, parse_args, run_daemon, validate_internal_secret


def test_parse_cli_commands():
    """CLI 支持 run、rebuild 与 reconcile --kb-id 参数解析。"""
    assert parse_args(["run"]).command == "run"
    assert parse_args(["rebuild"]).command == "rebuild"
    rec = parse_args(["reconcile", "--kb-id", "42"])
    assert rec.command == "reconcile"
    assert rec.kb_id == 42


def test_validate_internal_secret_rejects_missing_or_blank(monkeypatch):
    """未显式设置或为空的 ANYNOTE_INTERNAL_SECRET 必须拒绝启动。"""
    monkeypatch.delenv("ANYNOTE_INTERNAL_SECRET", raising=False)
    with pytest.raises(RuntimeError) as captured:
        validate_internal_secret(Settings(_env_file=None))
    assert str(captured.value) == MISSING_INTERNAL_SECRET_MESSAGE

    with pytest.raises(RuntimeError):
        validate_internal_secret(Settings(ANYNOTE_INTERNAL_SECRET="   "))

    validate_internal_secret(Settings(ANYNOTE_INTERNAL_SECRET="valid-secret"))


async def test_health_probe_server_serves_healthz():
    """内网探针仅暴露 /healthz 且在异常状态返回 503。"""
    probe = HealthProbeServer("127.0.0.1", 0)
    await probe.start()
    try:
        async with httpx.AsyncClient() as client:
            ok = await client.get(f"http://127.0.0.1:{probe.bound_port}/healthz")
            assert ok.status_code == 200
            assert ok.json()["status"] == "ok"

            missing = await client.get(f"http://127.0.0.1:{probe.bound_port}/metrics")
            assert missing.status_code == 404

            probe.healthy = False
            unhealthy = await client.get(f"http://127.0.0.1:{probe.bound_port}/healthz")
            assert unhealthy.status_code == 503
    finally:
        await probe.close()


async def test_run_daemon_runs_cycle_and_stops_cleanly(monkeypatch):
    """守护循环完成首次增量同步、启动探针并优雅响应停止信号。"""

    class FakeNacos:
        def __init__(self):
            self.started = False
            self.closed = False

        async def start(self):
            self.started = True

        async def close(self):
            self.closed = True

    class FakePipeline:
        def __init__(self, stop_event: asyncio.Event):
            self.runs = 0
            self._stop = stop_event

        async def run_incremental(self) -> int:
            self.runs += 1
            self._stop.set()
            return 2

    async def fake_listener(_url, _channel, _wakeup, stop_event, _logger):
        await stop_event.wait()

    monkeypatch.setattr("worker._redis_wakeup_listener", fake_listener)

    settings = Settings(
        ANYNOTE_INTERNAL_SECRET="secret",
        INDEXER_HEALTH_HOST="127.0.0.1",
        INDEXER_HEALTH_PORT=0,
    )
    runtime_store = RuntimeConfigStore(settings.runtime_defaults())
    stop = asyncio.Event()
    pipeline = FakePipeline(stop)
    nacos = FakeNacos()
    probe = HealthProbeServer("127.0.0.1", 0)

    await run_daemon(settings, runtime_store, pipeline, nacos, probe, stop_event=stop)  # type: ignore[arg-type]
    assert nacos.started and nacos.closed
    assert pipeline.runs == 1
    assert probe.healthy is True
