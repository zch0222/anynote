from fastapi import APIRouter, Depends, Request
from service.rag_service import RagService
from model.dto import RagFileIndexDTO
from model.vo import ResData
import uuid
from fastapi.responses import StreamingResponse
from model.dto import RagQueryDTO

rag_router = APIRouter()
def get_rag_service(request: Request) -> RagService:
    return RagService()

@rag_router.post("/api/rag/query/v2")
def index(request: Request, data: RagQueryDTO, service: RagService = Depends(get_rag_service)):
    task_id = uuid.uuid4().__str__()
    headers = {
        # 设置返回数据类型是SSE
        'Content-Type': 'text/event-stream;charset=UTF-8',
        # 保证客户端的数据是新的
        'Cache-Control': 'no-cache',
    }
    return StreamingResponse(service.a_rag(data, task_id), headers=headers)
