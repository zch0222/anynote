"""多源知识实体适配器（覆盖 note 服务 8 类实体与 notify 通知）。

@author 称霸幼儿园
"""

import re
from collections.abc import AsyncIterator

from clients.file import FileClient
from clients.knowledge import KnowledgeClient
from clients.notify import NotifyClient
from core.config import IndexerRuntimeSettings
from indexing.models import (
    ALL_ENTITY_TYPES,
    NOTE_ENTITY_TYPES,
    ParsedDocument,
    SourceDocument,
)
from indexing.parsers import parse_document_text, parse_pdf_bytes
from indexing.parsers.pdf import PdfParseError

_NOTICE_REF_RE = re.compile(r"^notice:(\d+)$")


def parse_notice_ref(ref: str) -> int | None:
    """若引用属于 notice 实体则返回主键 id，否则返回 None。

    :param ref: 实体引用字符串
    :return: 通知 id 或 None
    """
    match = _NOTICE_REF_RE.match(ref.strip())
    return int(match.group(1)) if match else None


class KnowledgeSourceAdapter:
    """聚合 note、file、notify 三个内部服务的源文档读取。

    @author 称霸幼儿园
    """

    def __init__(
        self,
        knowledge_client: KnowledgeClient,
        file_client: FileClient,
        notify_client: NotifyClient,
    ):
        self._knowledge = knowledge_client
        self._file = file_client
        self._notify = notify_client

    async def iter_export(
        self,
        kb_id: int | None = None,
        page_size: int = 100,
        entity_types: tuple[str, ...] = ALL_ENTITY_TYPES,
    ) -> AsyncIterator[list[SourceDocument]]:
        """按实体类型游标分页拉取全部权威源文档。

        :param kb_id: 可选知识库 id 过滤
        :param page_size: 单页拉取上限
        :param entity_types: 待遍历的实体类型集合
        :return: 每页源文档列表异步序列
        """
        limit = max(1, min(page_size, 200))
        for entity_type in entity_types:
            after_id = 0
            while True:
                if entity_type == "notice":
                    page = await self._notify.export_notices(after_id=after_id, limit=limit)
                    docs = (
                        [doc for doc in page.documents if doc.kb_id == kb_id]
                        if kb_id is not None
                        else page.documents
                    )
                else:
                    if entity_type not in NOTE_ENTITY_TYPES:
                        break
                    page = await self._knowledge.export(
                        entity_type=entity_type,
                        after_id=after_id,
                        limit=limit,
                        kb_id=kb_id,
                    )
                    docs = page.documents
                if docs:
                    yield docs
                if not page.has_more or not page.next_after_id or page.next_after_id <= after_id:
                    break
                after_id = page.next_after_id

    async def fetch_by_refs(self, refs: list[str]) -> tuple[list[SourceDocument], list[str]]:
        """按规范引用批量读取源文档，自动路由到 note 或 notify 服务。

        :param refs: 规范实体引用列表
        :return: （命中的源文档列表, 缺失引用列表）
        """
        if not refs:
            return [], []

        unique_refs = list(dict.fromkeys(ref.strip() for ref in refs if ref and ref.strip()))
        notice_ids: list[int] = []
        note_refs: list[str] = []
        for ref in unique_refs:
            notice_id = parse_notice_ref(ref)
            if notice_id is not None:
                notice_ids.append(notice_id)
            else:
                note_refs.append(ref)

        documents: list[SourceDocument] = []
        missing_refs: list[str] = []

        if note_refs:
            note_batch = await self._knowledge.documents_batch(note_refs, include_body=True)
            documents.extend(note_batch.documents)
            missing_refs.extend(note_batch.missing_refs)

        if notice_ids:
            notice_batch = await self._notify.notices_batch(notice_ids)
            documents.extend(notice_batch.documents)
            missing_refs.extend(f"notice:{missing_id}" for missing_id in notice_batch.missing_ids)

        return documents, missing_refs

    async def extract_document(
        self,
        document: SourceDocument,
        runtime: IndexerRuntimeSettings,
    ) -> ParsedDocument:
        """提取并解析源文档内容（PDF 从文件服务流式拉取，文本直接解析）。

        :param document: 源文档对象
        :param runtime: 索引运行参数
        :return: 结构化解析结果
        """
        fmt = (document.format or "").strip().lower()
        if document.entity_type == "doc" or fmt == "pdf":
            object_name = (document.object_name or "").strip()
            if not object_name:
                raise PdfParseError("资料缺少文件对象路径")
            raw_bytes = await self._file.download_bytes(object_name, max_bytes=runtime.pdf_max_bytes)
            return await parse_pdf_bytes(
                raw_bytes,
                timeout_s=runtime.pdf_parse_timeout_s,
                max_memory_mb=runtime.pdf_max_memory_mb,
            )
        return parse_document_text(document)
