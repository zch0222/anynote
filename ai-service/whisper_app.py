"""Whisper 进程启动入口。

@author 称霸幼儿园
"""

from core.config import get_settings
from whisper.app import create_whisper_app

app = create_whisper_app(get_settings())

if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(app="whisper_app:app", host=settings.APP_HOST, port=settings.PORT, workers=1)
