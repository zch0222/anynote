from fastapi import APIRouter, Depends, Request
from service.rag_service import RagService
from model.dto import RagFileIndexDTO
from model.vo import ResData
import uuid
from fastapi.responses import StreamingResponse
from model.dto import RagQueryDTO

rag_router = APIRouter(tags=["rag"])

def get_rag_service(request: Request) -> RagService:
    return RagService()

@rag_router.post(
    "/api/rag/query/v2",
    summary="RAG 文档问答（SSE 流式）",
    description="基于向量检索增强生成（RAG）的文档问答，返回 Server-Sent Events 格式",
    response_class=StreamingResponse,
    responses={
        200: {"description": "SSE 事件流，Content-Type: text/event-stream"},
        401: {"description": "未授权"},
        500: {"description": "服务器错误"},
    },
)
def index(request: Request, data: RagQueryDTO, service: RagService = Depends(get_rag_service)):
    task_id = uuid.uuid4().__str__()
    headers = {
        # 设置返回数据类型是SSE
        "Content-Type": "text/event-stream;charset=UTF-8",
        # 保证客户端的数据是新的
        "Cache-Control": "no-cache",
    }
    return StreamingResponse(service.a_rag(data, task_id), headers=headers)
