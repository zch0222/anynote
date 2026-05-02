from fastapi import FastAPI, HTTPException
from core.config import HOST, TOKEN, PORT, APP_HOST
from starlette.requests import Request
from starlette.responses import JSONResponse
from model.vo import ResData
from core.logger import get_logger
from controller.chat_controller import chat_router
from controller.rag_controller import rag_router
from controller.whisper_controller import whisper_router
from init.check_data_path import check_data_path
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from contextlib import asynccontextmanager
from core.nacos import NacosClient
from core.executors import executor


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 定时器
    scheduler = AsyncIOScheduler()
    nacos_client = NacosClient()
    nacos_client.register()
    scheduler.add_job(nacos_client.sent_heartbeat, 'interval', seconds=10)
    scheduler.start()
    yield
    scheduler.shutdown()
    executor.shutdown(wait=True)
    print("executor closed")
    # Clean up the ML models and release the resources
    # ml_models.clear()

app = FastAPI(lifespan=lifespan)

app.include_router(chat_router)
app.include_router(rag_router)
app.include_router(whisper_router)






# 鉴权
# @app.middleware("http")
# async def http_middleware(request: Request, call_next):
#     # response = Response("Internal server error", status_code=500)
#     if request.method == "OPTIONS":
#         response = await call_next(request)
#         return response
#     try:
#         token = request.headers["Authorization"]
#         print(token)
#         print(token.split()[-1])
#         if token.split()[-1] != TOKEN:
#             raise HTTPException(status_code=401, detail="Invalid token")
#     except KeyError:
#         raise HTTPException(status_code=401, detail="Missing token")
#
#     # 继续处理请求
#     response = await call_next(request)
#     return response

# 全局异常处理
@app.exception_handler(Exception)
async def exception_handler(request: Request, exc: Exception):
    logger = get_logger()
    logger.exception("An error occurred while processing request")

    # 检查异常是否为HTTPException
    if isinstance(exc, HTTPException):
        # 如果是HTTPException，返回异常指定的状态码
        return JSONResponse(
            status_code=exc.status_code,
            content=ResData.error(exc.detail)
        )
    # 对于非HTTPException异常，返回500内部服务器错误
    return JSONResponse(
        status_code=500,
        content=ResData.error("An internal server error occurred")
    )

def init():
    # 检查DATA_PATH是否存在
    check_data_path()

if __name__ == "__main__":
    init()
    print(HOST, APP_HOST)
    print(TOKEN)
    import uvicorn

    uvicorn.run(app="app:app", host=APP_HOST, port=PORT, workers=1)