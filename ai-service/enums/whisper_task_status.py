from enum import Enum

class WhisperTaskStatus:
    # 下载中
    DOWNLOADING = "DOWNLOADING"
    # 运行中
    RUNNING = "RUNNING"
    # 已完成
    DONE = "DONE"
    # 失败
    FAILED = "FAILED"