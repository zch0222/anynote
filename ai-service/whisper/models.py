"""Whisper 请求模型。

@author 称霸幼儿园
"""

from pydantic import BaseModel


class AudioTranscriptionDTO(BaseModel):
    """音频转写请求。

    @author 称霸幼儿园
    """

    file_url: str
    model: str
    language: str | None = None
    prompt: str | None = None
    response_format: str | None = None
