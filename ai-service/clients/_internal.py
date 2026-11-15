"""内部服务 HMAC 调用公共辅助。

@author 称霸幼儿园
"""

import time
from typing import Any

import httpx

from core.auth import sign_timestamp
from core.config import Settings


class InternalServiceError(RuntimeError):
    """内部微服务调用异常。

    @author 称霸幼儿园
    """

    def __init__(self, service: str, message: str, code: str | None = None):
        super().__init__(f"{service}: {message}")
        self.service = service
        self.message = message
        self.code = code


def internal_headers(settings: Settings) -> dict[str, str]:
    """构造带 HMAC 签名的内部调用请求头。

    :param settings: 应用配置
    :return: 请求头字典
    """
    timestamp = str(int(time.time() * 1000))
    secret = settings.ANYNOTE_INTERNAL_SECRET.get_secret_value()
    return {
        "from-source": "inner",
        "X-Internal-Timestamp": timestamp,
        "X-Internal-Sign": sign_timestamp(secret, timestamp),
    }


def unwrap_res_data(response: httpx.Response, service: str) -> Any:
    """校验 HTTP 状态并解包统一 ResData 响应。

    :param response: HTTP 响应对象
    :param service: 服务标识
    :return: 解包后的 data 字段
    """
    if response.status_code != 200:
        raise InternalServiceError(service, f"HTTP {response.status_code}")
    try:
        envelope = response.json()
    except ValueError as error:
        raise InternalServiceError(service, "响应不是合法 JSON") from error
    if not isinstance(envelope, dict) or envelope.get("code") != "00000":
        msg = envelope.get("msg", "未知错误") if isinstance(envelope, dict) else "响应格式错误"
        code = envelope.get("code") if isinstance(envelope, dict) else None
        raise InternalServiceError(service, str(msg), str(code) if code is not None else None)
    return envelope.get("data")
