"""Java 通知服务内部知识库通知客户端。

@author 称霸幼儿园
"""

import httpx

from clients._internal import InternalServiceError, internal_headers, unwrap_res_data
from core.config import Settings
from indexing.models import KnowledgeExportPage, KnowledgeNoticeBatch


class NotifyClient:
    """通过 @InnerAuth 调用 anynote-modules-notify 内部通知接口。

    @author 称霸幼儿园
    """

    def __init__(self, settings: Settings, client_factory=None, timeout_s: float = 15.0):
        self._settings = settings
        self._client_factory = client_factory or httpx.AsyncClient
        self._timeout_s = timeout_s
        self._base_url = settings.NOTIFY_SERVICE_URL.rstrip("/")

    async def export_notices(self, after_id: int = 0, limit: int = 100) -> KnowledgeExportPage:
        """按主键游标分页导出有效知识库通知。

        :param after_id: 上一页最后扫描的通知 id
        :param limit: 单页上限（最大 200）
        :return: 通知导出分页结果
        """
        try:
            async with self._client_factory(timeout=self._timeout_s) as client:
                response = await client.post(
                    f"{self._base_url}/internal/v1/notices/export",
                    json={"afterId": after_id, "limit": limit},
                    headers=internal_headers(self._settings),
                )
        except httpx.HTTPError as error:
            raise InternalServiceError("anynote-notify", str(error)) from error
        data = unwrap_res_data(response, "anynote-notify")
        return KnowledgeExportPage.model_validate(data)

    async def notices_batch(self, ids: list[int]) -> KnowledgeNoticeBatch:
        """按通知 ID 批量获取有效知识库通知（自动按 100 条分片）。

        :param ids: 通知主键列表
        :return: 命中通知与缺失 id 合集
        """
        if not ids:
            return KnowledgeNoticeBatch()
        documents = []
        missing_ids: list[int] = []
        for start in range(0, len(ids), 100):
            batch_ids = ids[start : start + 100]
            try:
                async with self._client_factory(timeout=self._timeout_s) as client:
                    response = await client.post(
                        f"{self._base_url}/internal/v1/notices/batch",
                        json={"ids": batch_ids},
                        headers=internal_headers(self._settings),
                    )
            except httpx.HTTPError as error:
                raise InternalServiceError("anynote-notify", str(error)) from error
            page = KnowledgeNoticeBatch.model_validate(unwrap_res_data(response, "anynote-notify"))
            documents.extend(page.documents)
            missing_ids.extend(page.missing_ids)
        return KnowledgeNoticeBatch(documents=documents, missing_ids=missing_ids)
