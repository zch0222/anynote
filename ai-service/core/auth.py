"""内部调用 HMAC 鉴权。

@author 称霸幼儿园
"""

import hashlib
import hmac
import time

from fastapi import Depends, Request

from core.config import Settings, get_settings
from core.errors import (
    INVALID_SIGNATURE_MESSAGE,
    INVALID_SOURCE_MESSAGE,
    MISSING_USER_MESSAGE,
    ApiError,
)

TIMESTAMP_WINDOW_MS = 5 * 60 * 1000


def sign_timestamp(secret: str, timestamp: str) -> str:
    """生成与 Java HmacUtils 一致的签名。

    :param secret: 内部调用密钥
    :param timestamp: 毫秒时间戳字符串
    :return: Base64 HMAC-SHA256 签名
    """
    import base64

    payload = hmac.new(secret.encode("utf-8"), timestamp.encode("utf-8"), hashlib.sha256)
    return base64.b64encode(payload.digest()).decode("ascii")


def verify_internal_headers(
    source: str | None,
    timestamp: str | None,
    signature: str | None,
    secret: str,
    now_ms: int | None = None,
) -> None:
    """校验来源、时间戳窗口和签名。

    :param source: 请求来源头
    :param timestamp: 毫秒时间戳
    :param signature: 请求签名
    :param secret: 内部调用密钥
    :param now_ms: 当前毫秒时间，未传时读取系统时间
    """
    if source != "inner":
        raise ApiError(401, "A0301", INVALID_SOURCE_MESSAGE)
    if not timestamp or not signature:
        raise ApiError(401, "A0301", INVALID_SIGNATURE_MESSAGE)
    try:
        signed_at = int(timestamp)
    except ValueError as error:
        raise ApiError(401, "A0301", INVALID_SIGNATURE_MESSAGE) from error
    current = int(time.time() * 1000) if now_ms is None else now_ms
    expected = sign_timestamp(secret, timestamp)
    if abs(current - signed_at) > TIMESTAMP_WINDOW_MS or not hmac.compare_digest(expected, signature):
        raise ApiError(401, "A0301", INVALID_SIGNATURE_MESSAGE)


def require_internal(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> None:
    """校验内部调用签名。

    :param request: 当前 HTTP 请求
    :param settings: 进程配置
    """
    verify_internal_headers(
        request.headers.get("from-source"),
        request.headers.get("x-internal-timestamp"),
        request.headers.get("x-internal-sign"),
        settings.ANYNOTE_INTERNAL_SECRET.get_secret_value(),
    )


def require_internal_user(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> str:
    """在内部签名后读取并校验用户令牌。

    :param request: 当前 HTTP 请求
    :param settings: 进程配置
    :return: 网关注入的用户令牌
    """
    require_internal(request, settings)
    token = request.headers.get("accesstoken")
    if not token or not token.strip():
        raise ApiError(401, "A0301", MISSING_USER_MESSAGE)
    return token
