from fastapi import APIRouter, Depends, Request
from model.dto import AudioTranscriptionDTO
from service.whisper_service import WhisperService
import uuid
from fastapi.responses import StreamingResponse

whisper_router = APIRouter()
@whisper_router.post("/v1/audio/transcriptions")
def transcriptions(request: Request, data: AudioTranscriptionDTO, service: WhisperService = Depends()):
    task_id = uuid.uuid4().__str__()
    headers = {
        # 设置返回数据类型是SSE
        'Content-Type': 'text/event-stream;charset=UTF-8',
        # 保证客户端的数据是新的
        'Cache-Control': 'no-cache',
    }
    return StreamingResponse(service.transcriptions(data, task_id), headers=headers)
