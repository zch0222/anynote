"""内部运行与取消接口。

@author 称霸幼儿园
"""

import asyncio

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from core.auth import require_internal_user
from harness.events import EventBus
from harness.models import RunRequest, RunState
from harness.runtime import RunManager, RunSession

router = APIRouter(prefix="/internal/v1/runs", tags=["harness-runs"])


def get_run_manager(request: Request) -> RunManager:
    """从应用状态取得运行管理器。

    :param request: 当前请求
    :return: 运行管理器
    """
    return request.app.state.run_manager


async def _stream_session(request: Request, manager: RunManager, session: RunSession):
    try:
        async for event in session.events.events():
            if await request.is_disconnected():
                await manager.cancel(session.context.run_id)
                await manager.drain(session)
                break
            yield EventBus.encode_sse(event)
    except asyncio.CancelledError:
        if session.context.state not in {RunState.COMPLETED, RunState.FAILED, RunState.CANCELLED}:
            await manager.cancel(session.context.run_id)
        await manager.drain(session)
        raise


@router.post(
    "",
    summary="启动最小 Agent 运行",
    response_class=StreamingResponse,
    responses={
        200: {"description": "统一事件信封的 SSE 流"},
        400: {"description": "请求参数错误"},
        401: {"description": "内部签名或用户令牌无效"},
    },
)
async def create_run(
    request: Request,
    body: RunRequest,
    access_token: str = Depends(require_internal_user),
    manager: RunManager = Depends(get_run_manager),
) -> StreamingResponse:
    """创建运行并返回 SSE 事件流。

    :param request: 当前请求
    :param body: 运行请求
    :param access_token: 当前用户令牌
    :param manager: 运行管理器
    :return: SSE 响应
    """
    session = await manager.create(body, access_token)
    return StreamingResponse(
        _stream_session(request, manager, session),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post(
    "/{run_id}/cancel",
    summary="取消运行",
    responses={
        200: {"description": "取消受理结果"},
        401: {"description": "内部签名无效"},
        404: {"description": "运行不存在"},
    },
)
async def cancel_run(
    run_id: str,
    _internal: None = Depends(require_internal_user),
    manager: RunManager = Depends(get_run_manager),
) -> dict:
    """取消活跃运行，已终态时返回当前状态。

    :param run_id: 运行标识
    :param _internal: 已验证的用户令牌
    :param manager: 运行管理器
    :return: 统一响应信封
    """
    result = await manager.cancel(run_id)
    return {"code": "00000", "msg": "操作成功", "data": result}
