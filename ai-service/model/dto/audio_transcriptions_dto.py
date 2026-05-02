from pydantic import BaseModel

class AudioTranscriptionDTO(BaseModel):
    # 文件链接
    file_url: str
    # 模型
    model: str
    # 语言 ISO-639-1
    language: str | None = None
    # 提示词
    prompt: str | None = None
    # 格式，json, text， srt, verbose_json, vtt
    response_format: str | None = None

