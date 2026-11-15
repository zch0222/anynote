"""索引 Worker CLI、密钥校验、/healthz 探针与守护循环测试。

@author 称霸幼儿园
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from core.config import RuntimeConfigStore, RuntimeSettings, Settings
from indexing.models import MISSING_INTERNAL_SECRET_MESSAGE
from worker import HealthProbeServer, execute_command, parse_args, run_daemon, validate_internal_secret


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
    probe = HealthProbeServer("127.0.0.1", 0)

    await run_daemon(settings, runtime_store, pipeline, probe, stop_event=stop)  # type: ignore[arg-type]
    assert pipeline.runs == 1
    assert probe.healthy is True


async def test_health_probe_reports_only_approved_watermark_fields():
    """健康探针返回索引水位及错误类型，并排除原始异常文本。"""
    watermark = {
        "processed_cursor": 12,
        "latest_cursor": 15,
        "lag_records": 3,
        "last_processed_at": "2026-11-15T10:00:00+00:00",
        "last_success_at": "2026-11-15T09:59:00+00:00",
        "last_error_type": "BulkWriteError",
        "chunker_version": "2",
        "embedding_profile_version": "1",
    }
    pipeline = MagicMock()
    pipeline.watermark = AsyncMock(return_value={**watermark, "last_error": "secret-body"})
    probe = HealthProbeServer("127.0.0.1", 0, pipeline=pipeline)
    await probe.start()
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"http://127.0.0.1:{probe.bound_port}/healthz")
            assert response.status_code == 200
            assert response.json() == {"status": "ok", "watermark": watermark}
            assert "secret-body" not in response.text
            missing = await client.get(f"http://127.0.0.1:{probe.bound_port}/metrics")
            assert missing.status_code == 404
            pipeline.watermark.assert_awaited_once()
    finally:
        await probe.close()


async def test_health_probe_watermark_failure_returns_error_type():
    """读取水位失败时探针返回 503，仅暴露异常类型。"""
    pipeline = MagicMock()
    pipeline.watermark = AsyncMock(side_effect=RuntimeError("secret-token-and-body"))
    probe = HealthProbeServer("127.0.0.1", 0, pipeline=pipeline)
    await probe.start()
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"http://127.0.0.1:{probe.bound_port}/healthz")
            assert response.status_code == 503
            assert response.json() == {
                "status": "unhealthy",
                "watermark": {"last_error_type": "RuntimeError"},
            }
            assert "secret-token-and-body" not in response.text
    finally:
        await probe.close()


@pytest.mark.parametrize("command", ["run", "rebuild", "reconcile"])
async def test_commands_load_nacos_before_building_es(monkeypatch, command):
    """所有命令先加载 Nacos，ES 超时与新索引副本数采用下发配置。"""
    events = []
    client = MagicMock()
    client.close = AsyncMock()
    client.indices.exists = AsyncMock(return_value=False)
    client.indices.create = AsyncMock()

    def construct_client(**kwargs):
        events.append("es")
        assert kwargs["request_timeout"] == 47.0
        return client

    client_constructor = MagicMock(side_effect=construct_client)
    monkeypatch.setattr("indexing.es_store.AsyncElasticsearch", client_constructor)

    class FakeNacos:
        """下发非默认索引配置并记录生命周期。"""

        def __init__(self, _settings, runtime_store):
            self._runtime_store = runtime_store

        async def start(self):
            """载入测试配置。"""
            events.append("nacos_start")
            self._runtime_store.update(RuntimeSettings.model_validate({
                "indexer": {"es-request-timeout-s": 47.0, "es-index-replicas": 2},
            }))

        async def close(self):
            """记录配置客户端关闭。"""
            events.append("nacos_close")

    monkeypatch.setattr("worker.NacosManager", FakeNacos)
    pipeline = MagicMock()

    async def create_indices(*_args, **_kwargs):
        """通过已装配存储创建测试索引。"""
        store = pipeline_constructor.call_args.kwargs["es_store"]
        await store.create_versioned_indices(5, None)

    pipeline.run_rebuild = AsyncMock(side_effect=create_indices)
    pipeline.run_reconcile = AsyncMock(side_effect=create_indices)
    pipeline_constructor = MagicMock(return_value=pipeline)
    monkeypatch.setattr("worker.IndexingPipeline", pipeline_constructor)
    daemon = AsyncMock(side_effect=create_indices)
    monkeypatch.setattr("worker.run_daemon", daemon)
    result = await execute_command(parse_args([command]), Settings(ANYNOTE_INTERNAL_SECRET="secret"))

    assert result == 0
    assert events == ["nacos_start", "es", "nacos_close"]
    client_constructor.assert_called_once()
    client.close.assert_awaited_once()
    assert len(client.indices.create.await_args_list) == 2
    assert all(call.kwargs["settings"]["number_of_replicas"] == 2
               for call in client.indices.create.await_args_list)
    if command == "run":
        daemon.assert_awaited_once()
    elif command == "rebuild":
        pipeline.run_rebuild.assert_awaited_once()
    else:
        pipeline.run_reconcile.assert_awaited_once_with(kb_id=None)


@pytest.mark.parametrize("failure_stage", ["start", "client", "store", "pipeline", "command"])
async def test_execute_command_closes_resources_after_failure(monkeypatch, failure_stage):
    """配置加载、装配或执行失败时，已创建的 Nacos 与 ES 资源均关闭。"""
    nacos = MagicMock()
    nacos.start = AsyncMock(side_effect=RuntimeError("start") if failure_stage == "start" else None)
    nacos.close = AsyncMock()
    monkeypatch.setattr("worker.NacosManager", MagicMock(return_value=nacos))
    client = MagicMock()
    client.close = AsyncMock()
    monkeypatch.setattr("worker.build_es_client", MagicMock(
        side_effect=RuntimeError("client") if failure_stage == "client" else None,
        return_value=client,
    ))
    if failure_stage == "store":
        monkeypatch.setattr("worker.ElasticsearchKnowledgeStore", MagicMock(side_effect=RuntimeError("store")))
    pipeline = MagicMock()
    pipeline.run_rebuild = AsyncMock(side_effect=RuntimeError("command"))
    monkeypatch.setattr("worker.IndexingPipeline", MagicMock(
        side_effect=RuntimeError("pipeline") if failure_stage == "pipeline" else None,
        return_value=pipeline,
    ))

    with pytest.raises(RuntimeError, match=failure_stage):
        await execute_command(parse_args(["rebuild"]), Settings(ANYNOTE_INTERNAL_SECRET="secret"))

    nacos.close.assert_awaited_once()
    if failure_stage in {"start", "client"}:
        client.close.assert_not_awaited()
    else:
        client.close.assert_awaited_once()


async def test_probe_start_failure_closes_probe(monkeypatch):
    """探针启动失败时仍执行探针关闭。"""
    probe = MagicMock()
    probe.start = AsyncMock(side_effect=OSError("port"))
    probe.close = AsyncMock()
    settings = Settings(ANYNOTE_INTERNAL_SECRET="secret")
    with pytest.raises(OSError, match="port"):
        await run_daemon(settings, RuntimeConfigStore(settings.runtime_defaults()), MagicMock(), probe)
    probe.close.assert_awaited_once()


async def test_nacos_closes_when_es_close_fails(monkeypatch):
    """ES 连接关闭失败时仍关闭 Nacos 客户端。"""
    nacos = MagicMock()
    nacos.start = AsyncMock()
    nacos.close = AsyncMock()
    monkeypatch.setattr("worker.NacosManager", MagicMock(return_value=nacos))
    pipeline = MagicMock()
    pipeline.run_rebuild = AsyncMock()
    store = MagicMock()
    store.close = AsyncMock(side_effect=RuntimeError("close"))
    monkeypatch.setattr("worker.build_pipeline", AsyncMock(return_value=(pipeline, store)))
    with pytest.raises(RuntimeError, match="close"):
        await execute_command(parse_args(["rebuild"]), Settings(ANYNOTE_INTERNAL_SECRET="secret"))
    pipeline.run_rebuild.assert_awaited_once()
    nacos.close.assert_awaited_once()


def test_poll_interval_defaults_to_three_seconds():
    """默认兜底轮询间隔采用方案规定的三秒。"""
    assert Settings(_env_file=None).runtime_defaults().indexer.poll_interval_s == 3.0
