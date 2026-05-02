from fastapi import APIRouter, Depends, Request
from model.dto import AudioTranscriptionDTO
from service.whisper_service import WhisperService
import uuid
from fastapi.responses import StreamingResponse

whisper_router = APIRouter(tags=["whisper"])

@whisper_router.post(
    "/v1/audio/transcriptions",
    summary="音频转写（SSE 流式）",
    description="使用 Whisper 模型对音频文件进行语音识别转写，返回 Server-Sent Events 格式",
    response_class=StreamingResponse,
    responses={
        200: {"description": "SSE 事件流，Content-Type: text/event-stream"},
        401: {"description": "未授权"},
        500: {"description": "服务器错误"},
    },
)
def transcriptions(request: Request, data: AudioTranscriptionDTO, service: WhisperService = Depends()):
    task_id = uuid.uuid4().__str__()
    headers = {
        # 设置返回数据类型是SSE
        "Content-Type": "text/event-stream;charset=UTF-8",
        # 保证客户端的数据是新的
        "Cache-Control": "no-cache",
    }
    return StreamingResponse(service.transcriptions(data, task_id), headers=headers)
