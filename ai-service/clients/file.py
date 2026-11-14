"""Java 文件服务内部读取客户端。

@author 称霸幼儿园
"""

import httpx

from clients._internal import InternalServiceError, internal_headers
from core.config import Settings


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

        :param object_name: 文件对象路径
        :param max_bytes: 允许下载的最大字节数
        :return: 文件字节内容
        """
        if not object_name or not object_name.strip():
            raise InternalServiceError("anynote-file", "对象名称不能为空")
        buf = bytearray()
        try:
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
                            raise InternalServiceError("anynote-file", "文件大小超出解析上限")
                        buf.extend(chunk)
        except httpx.HTTPError as error:
            raise InternalServiceError("anynote-file", str(error)) from error
        return bytes(buf)
