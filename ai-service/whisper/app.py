"""独立 Whisper FastAPI 应用工厂。

@author 称霸幼儿园
"""

from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI

from api.errors import register_exception_handlers
from api.health import router as health_router
from clients.nacos import NacosManager
from core.config import RuntimeConfigStore, Settings, get_settings
from core.logger import configure_logging
from whisper.api import router as whisper_router
from whisper.service import WhisperService


def create_whisper_app(settings: Settings) -> FastAPI:
    """创建独立 Whisper 应用。

    :param settings: 进程配置
    :return: FastAPI 应用
    """
    configure_logging()
    config_store = RuntimeConfigStore(settings.runtime_defaults())
    nacos = NacosManager(settings, config_store)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        executor = ProcessPoolExecutor(max_workers=2)
        app.state.whisper_service = WhisperService(
            executor,
            settings.REDIS_URL,
            settings.DATA_PATH,
        )
        await nacos.start()
        try:
            yield
        finally:
            executor.shutdown(wait=False, cancel_futures=True)
            await nacos.close()

    app = FastAPI(
        title="Anynote Whisper",
        version=settings.APP_VERSION,
        lifespan=lifespan,
        openapi_url="/v3/api-docs",
        docs_url="/swagger-ui.html",
    )
    app.dependency_overrides[get_settings] = lambda: settings
    register_exception_handlers(app)
    app.include_router(health_router)
    app.include_router(whisper_router)
    return app
