from pydantic import BaseModel
from typing import Optional

class AudioTranscriptionDTO(BaseModel):
    # 文件链接
    file_url: str
    # 模型
    model: str
    # 语言 ISO-639-1
    language: Optional[str] = None
    # 提示词
    prompt: Optional[str] = None
    # 格式，json, text， srt, verbose_json, vtt
    response_format: Optional[str] = None

