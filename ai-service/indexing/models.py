"""索引管线数据模型与异常定义。

@author 称霸幼儿园
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

INDEX_VERSION_CONFLICT_MESSAGE = "当前索引版本与激活映射不一致，请执行 rebuild 重建索引"
MISSING_INTERNAL_SECRET_MESSAGE = "未配置 ANYNOTE_INTERNAL_SECRET，索引 Worker 拒绝启动"
EGRESS_FORBIDDEN_MESSAGE = "模型供应商未允许数据出境，拒绝发送知识内容进行向量化"
SCANNED_PDF_MESSAGE = "PDF 未检测到可提取文本（疑似扫描件）"
PDF_PARSE_LIMIT_MESSAGE = "PDF 解析超时或超出内存限制"

DOC_STATUS_INDEXED = 0
DOC_STATUS_INDEXING = 1
DOC_STATUS_FAILED = 2
DOC_STATUS_NOT_INDEXED = 3
DOC_STATUS_UNEXTRACTABLE = 4

NOTE_ENTITY_TYPES = ("kb", "note", "doc", "mooc", "mooc_item", "transcript", "summary", "task")
ALL_ENTITY_TYPES = (*NOTE_ENTITY_TYPES, "notice")


class IndexVersionConflictError(RuntimeError):
    """激活索引元数据与当前向量模型/维度不一致。

    @author 称霸幼儿园
    """

    def __init__(self, message: str = INDEX_VERSION_CONFLICT_MESSAGE):
        super().__init__(message)


class SourceAcl(BaseModel):
    """源文档访问控制信息。

    @author 称霸幼儿园
    """

    create_by: int | None = None
    permissions: str | None = None
    data_scope: int | None = None
    task_member_ids: list[int] | None = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SourceDocument(BaseModel):
    """统一知识源文档模型。

    @author 称霸幼儿园
    """

    ref: str
    entity_type: str
    subtype: str | None = None
    entity_id: int
    kb_id: int | None = None
    parent_ref: str | None = None
    title: str | None = None
    format: str | None = None
    body: str | None = None
    object_name: str | None = None
    content_url: str | None = None
    acl: SourceAcl | None = None
    authority: str = "original"
    content_version: str | None = None
    meta_version: str | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    source_created_at: datetime | int | str | None = None
    source_updated_at: datetime | int | str | None = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @field_validator("attributes", mode="before")
    @classmethod
    def _coerce_attributes(cls, value: Any) -> dict[str, Any]:
        return {} if value is None else value

    @property
    def canonical_key(self) -> str:
        """生成条目在索引中的唯一存储标识（视频字幕与总结附加 subtype）。

        :return: 唯一索引键（如 mooc_item:5#transcript）
        """
        if self.subtype:
            return f"{self.ref}#{self.subtype}"
        return self.ref


class KnowledgeChangeEvent(BaseModel):
    """统一知识变更事件。

    @author 称霸幼儿园
    """

    id: int
    entity_type: str
    entity_id: int
    kb_id: int | None = None
    operation: str
    create_time: datetime | int | str | None = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @property
    def ref(self) -> str:
        """推导变更对应的规范实体引用。

        :return: 实体引用字符串
        """
        if self.entity_type == "transcript":
            return f"mooc_item:{self.entity_id}#transcript"
        if self.entity_type == "summary":
            return f"mooc_item:{self.entity_id}#summary"
        return f"{self.entity_type}:{self.entity_id}"


class KnowledgeChangePage(BaseModel):
    """知识变更游标分页结果。

    @author 称霸幼儿园
    """

    changes: list[KnowledgeChangeEvent] = Field(default_factory=list)
    next_cursor: int = 0
    latest_cursor: int = 0

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @field_validator("changes", mode="before")
    @classmethod
    def _coerce_changes(cls, value: Any) -> list[Any]:
        return [] if value is None else value

    @field_validator("next_cursor", "latest_cursor", mode="before")
    @classmethod
    def _coerce_cursors(cls, value: Any) -> int:
        return 0 if value is None else int(value)


class KnowledgeExportPage(BaseModel):
    """知识源文档导出分页结果。

    @author 称霸幼儿园
    """

    documents: list[SourceDocument] = Field(default_factory=list)
    next_after_id: int | None = None
    has_more: bool = False

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @field_validator("documents", mode="before")
    @classmethod
    def _coerce_documents(cls, value: Any) -> list[Any]:
        return [] if value is None else value


class KnowledgeDocumentBatch(BaseModel):
    """按引用批量读取源文档结果。

    @author 称霸幼儿园
    """

    documents: list[SourceDocument] = Field(default_factory=list)
    missing_refs: list[str] = Field(default_factory=list)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @field_validator("documents", "missing_refs", mode="before")
    @classmethod
    def _coerce_lists(cls, value: Any) -> list[Any]:
        return [] if value is None else value


class KnowledgeNoticeBatch(BaseModel):
    """按通知 ID 批量读取结果。

    @author 称霸幼儿园
    """

    documents: list[SourceDocument] = Field(default_factory=list)
    missing_ids: list[int] = Field(default_factory=list)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @field_validator("documents", "missing_ids", mode="before")
    @classmethod
    def _coerce_lists(cls, value: Any) -> list[Any]:
        return [] if value is None else value


class ParsedSection(BaseModel):
    """解析器提取出的结构化文本段落。

    @author 称霸幼儿园
    """

    text: str
    section_path: str | None = None
    page_no: int | None = None
    start_ms: int | None = None
    end_ms: int | None = None
    start_line: int | None = None
    end_line: int | None = None
    section_start_line: int | None = None
    block_type: Literal["paragraph", "list", "image", "code", "table"] = "paragraph"
    extraction_mode: Literal["text", "ocr", "none"] = "text"
    source_region_id: str | None = None


class ParsedDocument(BaseModel):
    """格式解析器统一输出。

    @author 称霸幼儿园
    """

    sections: list[ParsedSection] = Field(default_factory=list)
    unextractable: bool = False
    reason: str | None = None
    page_count: int | None = None
    content_mode: Literal["text", "mixed", "none"] = "text"
    extractor_version: str = ""


class ChunkPayload(BaseModel):
    """待写入 Elasticsearch 的分块载荷。

    @author 称霸幼儿园
    """

    chunk_id: str
    item_key: str = ""
    ref: str
    entity_type: str
    subtype: str | None = None
    entity_id: int
    kb_id: int | None = None
    chunk_index: int
    title: str
    content: str
    section_path: str | None = None
    page_no: int | None = None
    start_ms: int | None = None
    end_ms: int | None = None
    start_line: int | None = None
    end_line: int | None = None
    authority: str = "original"
    extraction_mode: Literal["text", "ocr", "none"] = "text"
    source_region_id: str | None = None
    content_version: str = ""
    meta_version: str = ""
    create_by: int | None = None
    permissions: str | None = None
    data_scope: int | None = None
    task_member_ids: list[int] | None = None
    source_updated_at: str | None = None
    embedding: list[float] | None = None
