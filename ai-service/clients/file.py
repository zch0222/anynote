"""Java 文件服务内部读取客户端。

@author 称霸幼儿园
"""

import asyncio

import httpx

from clients._internal import InternalServiceError, internal_headers
from core.config import Settings

MAX_DOWNLOAD_ATTEMPTS = 3
DOWNLOAD_RETRY_DELAY_S = 0.05


class FileSizeLimitError(InternalServiceError):
    """文件内容超过调用方指定的字节上限。

    @author 称霸幼儿园
    """


class FileClient:
    """通过 @InnerAuth 从 anynote-modules-file 流式下载文件内容。

    @author 称霸幼儿园
    """

    def __init__(self, settings: Settings, client_factory=None, timeout_s: float = 30.0):
        self._settings = settings
        self._client_factory = client_factory or httpx.AsyncClient
        self._timeout_s = timeout_s
        self._base_url = settings.FILE_SERVICE_URL.rstrip("/")

    async def download_bytes(
        self,
        object_name: str,
        max_bytes: int = 50 * 1024 * 1024,
    ) -> bytes:
        """按对象路径流式下载文件内容并限制最大字节数。

        仅响应流协议错误进行最多三次尝试，其他 HTTP 与业务错误立即归类。

        :param object_name: 文件对象路径
        :param max_bytes: 允许下载的最大字节数
        :return: 文件字节内容
        """
        if not object_name or not object_name.strip():
            raise InternalServiceError("anynote-file", "对象名称不能为空")
        for attempt in range(MAX_DOWNLOAD_ATTEMPTS):
            try:
                return await self._download_once(object_name, max_bytes)
            except httpx.RemoteProtocolError as error:
                if attempt + 1 >= MAX_DOWNLOAD_ATTEMPTS:
                    raise InternalServiceError("anynote-file", str(error)) from error
                await asyncio.sleep(DOWNLOAD_RETRY_DELAY_S * (attempt + 1))
            except httpx.HTTPError as error:
                raise InternalServiceError("anynote-file", str(error)) from error
        raise InternalServiceError("anynote-file", "文件下载失败")

    async def _download_once(self, object_name: str, max_bytes: int) -> bytes:
        """执行一次受限流式下载，不使用跨请求连接状态。"""
        buf = bytearray()
        async with self._client_factory(timeout=self._timeout_s) as client:
            async with client.stream(
                "GET",
                f"{self._base_url}/internal/v1/files/content",
                params={"objectName": object_name},
                headers=internal_headers(self._settings),
            ) as response:
                if response.status_code != 200:
                    await response.aread()
                    raise InternalServiceError("anynote-file", f"HTTP {response.status_code}")
                content_type = response.headers.get("content-type", "")
                if "application/json" in content_type.lower():
                    await response.aread()
                    raise InternalServiceError("anynote-file", "文件对象读取返回异常响应")
                async for chunk in response.aiter_bytes():
                    if len(buf) + len(chunk) > max_bytes:
                        raise FileSizeLimitError("anynote-file", "文件大小超出解析上限")
                    buf.extend(chunk)
        return bytes(buf)
