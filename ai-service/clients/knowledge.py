"""Java 笔记服务内部知识访问客户端。

@author 称霸幼儿园
"""

import httpx

from clients._internal import InternalServiceError, internal_headers, unwrap_res_data
from core.config import Settings
from indexing.models import (
    KnowledgeChangePage,
    KnowledgeDocumentBatch,
    KnowledgeExportPage,
)


class KnowledgeClient:
    """通过 @InnerAuth 调用 anynote-modules-note 内部知识端点。

    @author 称霸幼儿园
    """

    def __init__(self, settings: Settings, client_factory=None, timeout_s: float = 15.0):
        self._settings = settings
        self._client_factory = client_factory or httpx.AsyncClient
        self._timeout_s = timeout_s
        self._base_url = settings.NOTE_SERVICE_URL.rstrip("/")

    async def changes(self, after_id: int = 0, limit: int = 100) -> KnowledgeChangePage:
        """按游标拉取增量变更记录。

        :param after_id: 上一次消费的最大变更 id
        :param limit: 单批最大条数
        :return: 变更分页结果
        """
        try:
            async with self._client_factory(timeout=self._timeout_s) as client:
                response = await client.get(
                    f"{self._base_url}/internal/v1/knowledge/changes",
                    params={"afterId": after_id, "limit": limit},
                    headers=internal_headers(self._settings),
                )
        except httpx.HTTPError as error:
            raise InternalServiceError("anynote-note", str(error)) from error
        data = unwrap_res_data(response, "anynote-note")
        return KnowledgeChangePage.model_validate(data)

    async def export(
        self,
        entity_type: str,
        after_id: int = 0,
        limit: int = 100,
        kb_id: int | None = None,
    ) -> KnowledgeExportPage:
        """按实体类型游标分页导出权威源文档。

        :param entity_type: 实体类型
        :param after_id: 上一页最后扫描的实体 id
        :param limit: 单页条数（最大 200）
        :param kb_id: 可选知识库过滤
        :return: 导出分页结果
        """
        payload: dict = {"entityType": entity_type, "afterId": after_id, "limit": limit}
        if kb_id is not None:
            payload["kbId"] = kb_id
        try:
            async with self._client_factory(timeout=self._timeout_s) as client:
                response = await client.post(
                    f"{self._base_url}/internal/v1/knowledge/export",
                    json=payload,
                    headers=internal_headers(self._settings),
                )
        except httpx.HTTPError as error:
            raise InternalServiceError("anynote-note", str(error)) from error
        data = unwrap_res_data(response, "anynote-note")
        return KnowledgeExportPage.model_validate(data)

    async def documents_batch(
        self,
        refs: list[str],
        include_body: bool = True,
    ) -> KnowledgeDocumentBatch:
        """按引用批量获取源文档（自动按 100 条分片）。

        :param refs: 规范引用列表
        :param include_body: 是否读取正文
        :return: 命中文档与缺失引用合集
        """
        if not refs:
            return KnowledgeDocumentBatch()
        documents = []
        missing_refs: list[str] = []
        for start in range(0, len(refs), 100):
            batch_refs = refs[start : start + 100]
            try:
                async with self._client_factory(timeout=self._timeout_s) as client:
                    response = await client.post(
                        f"{self._base_url}/internal/v1/knowledge/documents/batch",
                        json={"refs": batch_refs, "includeBody": include_body},
                        headers=internal_headers(self._settings),
                    )
            except httpx.HTTPError as error:
                raise InternalServiceError("anynote-note", str(error)) from error
            page = KnowledgeDocumentBatch.model_validate(unwrap_res_data(response, "anynote-note"))
            documents.extend(page.documents)
            missing_refs.extend(page.missing_refs)
        return KnowledgeDocumentBatch(documents=documents, missing_refs=missing_refs)

    async def update_doc_index_status(self, doc_id: int, status: int) -> None:
        """回写资料索引状态。

        :param doc_id: 资料主键 id
        :param status: 索引状态（0=已索引, 1=索引中, 2=失败, 3=未索引, 4=无法提取）
        """
        try:
            async with self._client_factory(timeout=self._timeout_s) as client:
                response = await client.put(
                    f"{self._base_url}/internal/v1/knowledge/docs/{doc_id}/index-status",
                    json={"status": status},
                    headers=internal_headers(self._settings),
                )
        except httpx.HTTPError as error:
            raise InternalServiceError("anynote-note", str(error)) from error
        unwrap_res_data(response, "anynote-note")
