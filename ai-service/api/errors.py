"""FastAPI 统一异常响应。

@author 称霸幼儿园
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from core.errors import INTERNAL_ERROR_MESSAGE, INVALID_INPUT_MESSAGE, ApiError
from core.logger import get_logger


def register_exception_handlers(app: FastAPI) -> None:
    """注册统一异常处理器。

    :param app: FastAPI 应用
    """
    logger = get_logger(__name__)

    @app.exception_handler(ApiError)
    async def handle_api_error(_request: Request, error: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=error.status_code,
            content={"code": error.code, "msg": error.message, "data": {}},
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request,
        _error: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content={"code": "A0160", "msg": INVALID_INPUT_MESSAGE, "data": {}},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_request: Request, error: Exception) -> JSONResponse:
        logger.error("未处理的 API 异常: %s", type(error).__name__, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"code": "B0001", "msg": INTERNAL_ERROR_MESSAGE, "data": {}},
        )
