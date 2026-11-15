"""Anynote 知识索引 Worker CLI 与守护进程入口。

@author 称霸幼儿园
"""

import argparse
import asyncio
import json
import signal
import sys
from contextlib import AsyncExitStack, suppress

import redis.asyncio as aioredis

from clients.file import FileClient
from clients.knowledge import KnowledgeClient
from clients.model_provider import ModelProviderClient
from clients.nacos import NacosManager
from clients.notify import NotifyClient
from core.config import RuntimeConfigStore, Settings
from core.logger import get_logger
from indexing.es_store import ElasticsearchKnowledgeStore, build_es_client
from indexing.models import MISSING_INTERNAL_SECRET_MESSAGE
from indexing.pipeline import IndexingPipeline
from models.openai_compatible import OpenAICompatibleAdapter


def validate_internal_secret(settings: Settings) -> None:
    """校验 worker 必须显式配置非空内部签名密钥。

    :param settings: 应用配置
    """
    secret = settings.ANYNOTE_INTERNAL_SECRET.get_secret_value().strip()
    if not secret or "ANYNOTE_INTERNAL_SECRET" not in settings.model_fields_set:
        raise RuntimeError(MISSING_INTERNAL_SECRET_MESSAGE)


class HealthProbeServer:
    """仅向容器内网暴露的极简 /healthz TCP/HTTP 探针服务。

    @author 称霸幼儿园
    """

    def __init__(self, host: str, port: int, pipeline: IndexingPipeline | None = None):
        """配置探针地址与可选索引水位来源。

        :param host: 内网监听地址
        :param port: 监听端口
        :param pipeline: 提供水位快照的索引管线
        """
        self._host = host
        self._port = port
        self._pipeline = pipeline
        self._server: asyncio.AbstractServer | None = None
        self.healthy = True

    @property
    def bound_port(self) -> int:
        """返回实际监听端口号。

        :return: 端口数值
        """
        if self._server and self._server.sockets:
            return int(self._server.sockets[0].getsockname()[1])
        return self._port

    async def start(self) -> None:
        """启动内网 /healthz 探针监听。"""
        self._server = await asyncio.start_server(self._handle_client, self._host, self._port)

    async def close(self) -> None:
        """停止探针服务器。"""
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

    async def _handle_client(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        """处理健康请求并返回已筛选的索引水位。"""
        try:
            raw_line = await asyncio.wait_for(reader.readline(), timeout=2.0)
            parts = raw_line.decode("ascii", errors="ignore").split()
            path = parts[1] if len(parts) >= 2 else "/"
            if path.split("?")[0] != "/healthz":
                status_line = "404 Not Found"
                body = json.dumps({"status": "not_found"}).encode()
            else:
                healthy = self.healthy
                payload: dict = {"status": "ok" if healthy else "unhealthy"}
                if self._pipeline is not None:
                    try:
                        watermark = await self._pipeline.watermark()
                        allowed_fields = (
                            "processed_cursor", "latest_cursor", "lag_records",
                            "last_processed_at", "last_success_at", "last_error_type",
                            "chunker_version", "embedding_profile_version",
                        )
                        payload["watermark"] = {
                            key: watermark.get(key) for key in allowed_fields
                        }
                    except Exception as error:
                        healthy = False
                        payload["status"] = "unhealthy"
                        payload["watermark"] = {"last_error_type": type(error).__name__}
                status_line = "200 OK" if healthy else "503 Service Unavailable"
                body = json.dumps(payload).encode()
            response = (
                f"HTTP/1.1 {status_line}\r\n"
                f"Content-Type: application/json\r\n"
                f"Content-Length: {len(body)}\r\n"
                f"Connection: close\r\n\r\n"
            ).encode("ascii") + body
            writer.write(response)
            await writer.drain()
        except Exception:
            pass
        finally:
            writer.close()
            with suppress(Exception):
                await writer.wait_closed()


async def build_pipeline(
    settings: Settings,
    runtime_store: RuntimeConfigStore,
) -> tuple[IndexingPipeline, ElasticsearchKnowledgeStore]:
    """装配索引管线与 ES 存储实例。

    :param settings: 进程配置
    :param runtime_store: Nacos 热更新配置容器
    :return: （索引管线实例, ES 存储实例）
    """
    runtime = runtime_store.get().indexer
    es_client = build_es_client(settings, runtime)
    try:
        es_store = ElasticsearchKnowledgeStore(es_client, replicas=runtime.es_index_replicas)
        pipeline = IndexingPipeline(
            settings=settings,
            runtime_store=runtime_store,
            model_provider_client=ModelProviderClient(settings),
            model_adapter=OpenAICompatibleAdapter(),
            knowledge_client=KnowledgeClient(settings),
            file_client=FileClient(settings),
            notify_client=NotifyClient(settings),
            es_store=es_store,
        )
        return pipeline, es_store
    except BaseException:
        await es_client.close()
        raise


async def _redis_wakeup_listener(
    redis_url: str,
    channel: str,
    wakeup_event: asyncio.Event,
    stop_event: asyncio.Event,
    logger,
) -> None:
    while not stop_event.is_set():
        client = None
        pubsub = None
        try:
            client = aioredis.from_url(redis_url, decode_responses=True)
            pubsub = client.pubsub()
            await pubsub.subscribe(channel)
            logger.info("已订阅知识变更 Redis 唤醒通道 channel=%s", channel)
            while not stop_event.is_set():
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if msg is not None:
                    wakeup_event.set()
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.warning("Redis 唤醒订阅异常，降级轮询并在 3 秒后重连: %s", error)
            with suppress(TimeoutError):
                await asyncio.wait_for(stop_event.wait(), timeout=3.0)
        finally:
            if pubsub is not None:
                with suppress(Exception):
                    await pubsub.close()
            if client is not None:
                with suppress(Exception):
                    await client.aclose()


async def run_daemon(
    settings: Settings,
    runtime_store: RuntimeConfigStore,
    pipeline: IndexingPipeline,
    probe: HealthProbeServer,
    stop_event: asyncio.Event | None = None,
) -> None:
    """运行持续增量消费守护循环，同时提供 /healthz 探针与 Redis 唤醒。

    :param settings: 进程配置
    :param runtime_store: 运行时配置容器
    :param pipeline: 索引管线实例
    :param probe: 内网健康探针
    :param stop_event: 可选停止信号，主要用于测试可控退出
    """
    logger = get_logger(__name__)
    stop = stop_event or asyncio.Event()
    wakeup = asyncio.Event()
    wakeup.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        with suppress(NotImplementedError):
            loop.add_signal_handler(sig, stop.set)

    listener_task: asyncio.Task | None = None
    last_reconcile = loop.time()

    try:
        await probe.start()
        listener_task = asyncio.create_task(
            _redis_wakeup_listener(
                settings.REDIS_URL,
                settings.REDIS_WAKEUP_CHANNEL,
                wakeup,
                stop,
                logger,
            )
        )
        while not stop.is_set():
            if wakeup.is_set():
                wakeup.clear()
            try:
                count = await pipeline.run_incremental()
                probe.healthy = True
                if count > 0:
                    logger.info("增量索引同步完成 processed=%d", count)
                reconcile_interval = runtime_store.get().indexer.reconcile_interval_s
                if reconcile_interval > 0 and (loop.time() - last_reconcile) >= reconcile_interval:
                    await pipeline.run_reconcile()
                    last_reconcile = loop.time()
            except Exception as error:
                logger.error("增量索引执行失败: %s", error, exc_info=True)
                probe.healthy = False

            if wakeup.is_set() or stop.is_set():
                continue

            timeout = runtime_store.get().indexer.poll_interval_s
            wait_wakeup = asyncio.create_task(wakeup.wait())
            wait_stop = asyncio.create_task(stop.wait())
            try:
                await asyncio.wait(
                    {wait_wakeup, wait_stop},
                    timeout=timeout,
                    return_when=asyncio.FIRST_COMPLETED,
                )
            finally:
                for task in (wait_wakeup, wait_stop):
                    task.cancel()
                    with suppress(asyncio.CancelledError):
                        await task
    finally:
        if listener_task is not None:
            listener_task.cancel()
            with suppress(asyncio.CancelledError):
                await listener_task
        await probe.close()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """解析 Worker CLI 命令参数。

    :param argv: 命令行参数列表
    :return: 解析后的参数对象
    """
    parser = argparse.ArgumentParser(description="Anynote 知识库索引 Worker")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("run", help="持续运行增量同步、Redis 唤醒与 /healthz 探针")
    subparsers.add_parser("rebuild", help="构建新版本物理索引并在完成后原子切换别名")
    reconcile_parser = subparsers.add_parser("reconcile", help="执行权威源与 ES 的全量对账补漏")
    reconcile_parser.add_argument("--kb-id", type=int, default=None, help="仅对账指定知识库 ID")
    return parser.parse_args(argv)


async def execute_command(args: argparse.Namespace, settings: Settings | None = None) -> int:
    """根据子命令执行索引操作或启动守护进程。

    :param args: CLI 解析结果
    :param settings: 可选注入配置
    :return: 进程退出码
    """
    cfg = settings or Settings()
    validate_internal_secret(cfg)
    runtime_store = RuntimeConfigStore(cfg.runtime_defaults())
    nacos = NacosManager(cfg, runtime_store)

    async with AsyncExitStack() as resources:
        resources.push_async_callback(nacos.close)
        await nacos.start()
        pipeline, es_store = await build_pipeline(cfg, runtime_store)
        resources.push_async_callback(es_store.close)
        if args.command == "run":
            probe = HealthProbeServer(cfg.INDEXER_HEALTH_HOST, cfg.INDEXER_HEALTH_PORT, pipeline)
            await run_daemon(cfg, runtime_store, pipeline, probe)
            return 0
        if args.command == "rebuild":
            await pipeline.run_rebuild()
            return 0
        if args.command == "reconcile":
            await pipeline.run_reconcile(kb_id=args.kb_id)
            return 0
        return 2


def main(argv: list[str] | None = None) -> int:
    """Worker 同步主入口。

    :param argv: 命令行参数列表
    :return: 退出码
    """
    logger = get_logger(__name__)
    try:
        args = parse_args(argv)
        return asyncio.run(execute_command(args))
    except Exception as error:
        logger.error("索引 Worker 退出: %s", error)
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
