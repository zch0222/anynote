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
from retrieval.models import (
    AuthorizationItem,
    ContentResult,
    KnowledgeScope,
    OutlineResult,
    QueryResult,
    StatsResult,
)

SERVICE_NAME = "anynote-note"


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

    async def scope(
        self,
        access_token: str,
        knowledge_base_ids: list[int] | None = None,
        refs: list[str] | None = None,
    ) -> KnowledgeScope:
        """以用户身份获取检索范围。

        :param access_token: 当前运行的用户令牌
        :param knowledge_base_ids: 显式知识库，为空表示默认范围
        :param refs: 显式实体引用
        :return: 检索范围
        """
        payload = {"knowledgeBaseIds": knowledge_base_ids or None, "refs": refs or None}
        data = await self._post_user("/internal/v1/knowledge/scope", access_token, payload)
        return KnowledgeScope.model_validate(data)

    async def authorize(self, access_token: str, items: list[tuple[str, str | None]]) -> list[AuthorizationItem]:
        """以用户身份批量确认可读性，单批不超过 100 条。

        :param access_token: 当前运行的用户令牌
        :param items: （基础引用, 附属类型）列表
        :return: 与输入同序的结果
        """
        if not items:
            return []
        payload = {"items": [{"ref": ref, "subtype": subtype} for ref, subtype in items]}
        data = await self._post_user("/internal/v1/knowledge/authorize", access_token, payload)
        return [AuthorizationItem.model_validate(item) for item in (data or {}).get("items") or []]

    async def content(self, access_token: str, request: dict) -> ContentResult:
        """以用户身份读取正文片段。

        :param access_token: 当前运行的用户令牌
        :param request: `/content` 请求体（ref、subtype、heading、行或时间范围、offset）
        :return: 正文片段
        """
        data = await self._post_user("/internal/v1/knowledge/content", access_token, request)
        return ContentResult.model_validate(data)

    async def outline(
        self,
        access_token: str,
        ref: str,
        parent_id: int | None = None,
        page_num: int = 1,
        page_size: int = 50,
    ) -> OutlineResult:
        """以用户身份读取目录或大纲。

        :param access_token: 当前运行的用户令牌
        :param ref: 知识库、慕课、笔记或文档类条目引用
        :param parent_id: 慕课下的上级条目 id
        :param page_num: 页码，从 1 开始
        :param page_size: 每页条数（1–100）
        :return: 分页目录
        """
        payload = {"ref": ref, "parentId": parent_id, "pageNum": page_num, "pageSize": page_size}
        data = await self._post_user("/internal/v1/knowledge/outline", access_token, payload)
        return OutlineResult.model_validate(data)

    async def query(self, access_token: str, request: dict) -> QueryResult:
        """以用户身份执行白名单结构化查询。

        :param access_token: 当前运行的用户令牌
        :param request: `/query` 请求体
        :return: 结果行与计数
        """
        data = await self._post_user("/internal/v1/knowledge/query", access_token, request)
        return QueryResult.model_validate(data)

    async def stats(self, access_token: str, knowledge_base_ids: list[int] | None = None) -> StatsResult:
        """以用户身份统计各知识库的直属可读内容。

        :param access_token: 当前运行的用户令牌
        :param knowledge_base_ids: 显式知识库，为空表示默认范围
        :return: 各知识库计数
        """
        payload = {"knowledgeBaseIds": knowledge_base_ids or None}
        data = await self._post_user("/internal/v1/knowledge/stats", access_token, payload)
        return StatsResult.model_validate(data)

    async def _post_user(self, path: str, access_token: str, payload: dict):
        headers = internal_headers(self._settings)
        headers["accessToken"] = access_token
        try:
            async with self._client_factory(timeout=self._timeout_s) as client:
                response = await client.post(f"{self._base_url}{path}", json=payload, headers=headers)
        except httpx.HTTPError as error:
            raise InternalServiceError(SERVICE_NAME, type(error).__name__) from error
        return unwrap_res_data(response, SERVICE_NAME)

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
