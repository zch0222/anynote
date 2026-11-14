"""Anynote Harness 在线进程入口。

@author 称霸幼儿园
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from api.errors import register_exception_handlers
from api.health import router as health_router
from api.runs import router as run_router
from clients.model_provider import ModelProviderClient
from clients.nacos import NacosManager
from core.config import RuntimeConfigStore, Settings, get_settings
from core.logger import configure_logging
from harness.runtime import RunManager
from models.router import ModelRouter


def create_app(
    settings: Settings | None = None,
    model=None,
    providers=None,
) -> FastAPI:
    """创建在线 FastAPI 应用。

    :param settings: 可替换的进程配置
    :param model: 可替换的模型接入实现
    :param providers: 可替换的供应商快照客户端
    :return: FastAPI 应用
    """
    settings = settings or get_settings()
    configure_logging()
    config_store = RuntimeConfigStore(settings.runtime_defaults())
    nacos = NacosManager(settings, config_store)
    run_manager = RunManager(
        settings,
        config_store,
        providers or ModelProviderClient(settings),
        model or ModelRouter(),
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        await nacos.start()
        try:
            yield
        finally:
            await run_manager.close()
            await nacos.close()

    app = FastAPI(
        lifespan=lifespan,
        title="Anynote AI Harness",
        version=settings.APP_VERSION,
        description="Anynote Harness 内部运行接口",
        openapi_url="/v3/api-docs",
        docs_url="/swagger-ui.html",
        redoc_url="/redoc",
    )
    app.dependency_overrides[get_settings] = lambda: settings
    app.state.run_manager = run_manager
    app.state.config_store = config_store
    app.state.nacos = nacos
    register_exception_handlers(app)
    app.include_router(health_router)
    app.include_router(run_router)
    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(app="app:app", host=settings.APP_HOST, port=settings.PORT, workers=1)
