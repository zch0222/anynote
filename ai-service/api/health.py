"""健康检查路由。

@author 称霸幼儿园
"""

from fastapi import APIRouter
from pydantic import BaseModel


class HealthResponse(BaseModel):
    """健康检查响应。

    @author 称霸幼儿园
    """

    status: str


router = APIRouter(tags=["health"])


@router.get(
    "/healthz",
    summary="进程健康检查",
    response_model=HealthResponse,
    responses={200: {"description": "进程可用"}},
)
async def healthz() -> HealthResponse:
    """返回进程健康状态。

    :return: 健康状态
    """
    return HealthResponse(status="UP")
