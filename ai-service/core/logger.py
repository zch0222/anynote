"""结构化标准输出日志。

@author 称霸幼儿园
"""

import json
import logging
from datetime import UTC, datetime


class JsonFormatter(logging.Formatter):
    """输出不包含请求正文的 JSON 日志。

    @author 称霸幼儿园
    """

    def format(self, record: logging.LogRecord) -> str:
        """格式化单条日志。

        :param record: 日志记录
        :return: JSON 日志行
        """
        payload = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        run_id = getattr(record, "run_id", None)
        if run_id:
            payload["runId"] = run_id
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    """配置根日志输出到标准输出。"""
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)


def get_logger(name: str) -> logging.Logger:
    """按模块名获取日志器。

    :param name: 模块名
    :return: 日志器
    """
    return logging.getLogger(name)
