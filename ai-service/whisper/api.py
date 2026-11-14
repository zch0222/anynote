"""Whisper 内部转写路由。

@author 称霸幼儿园
"""

import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from core.auth import require_internal_user
from whisper.models import AudioTranscriptionDTO
from whisper.service import WhisperService

router = APIRouter(tags=["whisper"])


def get_whisper_service(request: Request) -> WhisperService:
    """读取应用级 Whisper 服务。

    :param request: 当前请求
    :return: Whisper 服务
    """
    return request.app.state.whisper_service


@router.post(
    "/v1/audio/transcriptions",
    summary="音频转写（SSE 流式）",
    response_class=StreamingResponse,
    responses={
        200: {"description": "Whisper 状态事件流"},
        401: {"description": "内部签名或用户令牌无效"},
    },
)
async def transcribe(
    data: AudioTranscriptionDTO,
    _access_token: str = Depends(require_internal_user),
    service: WhisperService = Depends(get_whisper_service),
) -> StreamingResponse:
    """创建转写任务并返回状态流。

    :param data: 转写请求
    :param _access_token: 已验证的用户令牌
    :param service: Whisper 服务
    :return: SSE 响应
    """
    return StreamingResponse(
        service.transcriptions(data, str(uuid.uuid4())),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )
