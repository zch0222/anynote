"""note 用户身份内部端点的请求与响应模型，以及检索中间结构。

@author 称霸幼儿园
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

ENTITY_TYPES = ("kb", "note", "doc", "mooc", "mooc_item", "transcript", "summary", "task")
SUBTYPES = ("transcript", "summary")
EXCLUDED_ENTITY_TYPES = ("notice",)
NOT_FOUND_MESSAGE = "知识内容不存在或不可读"
SEMANTIC_UNAVAILABLE_MESSAGE = "语义检索暂不可用，本次仅使用全文检索"
SEARCH_UNAVAILABLE_MESSAGE = "检索通道不可用"
DOC_UNAVAILABLE_MESSAGE = "资料正文暂不可读取"
NO_MATCH_MESSAGE = "未找到匹配内容"
CONTINUE_READ_MESSAGE = "内容未读完，续读请传 offset={offset}"
STALE_MESSAGE = "部分证据对应的内容已更新，索引尚未同步"
OCR_TRANSCRIPT_MESSAGE = "这是 OCR 识别文本，重要内容请用 kb_view_doc 核对原页"
PDF_OCR_DISABLED_MESSAGE = "PDF 未检测到可提取文本，且 OCR 未开启"
VISUAL_RUN_LIMIT_MESSAGE = "本次运行可读取的页面图像数量已达上限"
KNOWLEDGE_ACCESS_UNAVAILABLE = "KNOWLEDGE_ACCESS_UNAVAILABLE"


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class ScopeKnowledgeBase(_CamelModel):
    """检索范围中的一个知识库。

    @author 称霸幼儿园
    """

    kb_id: int
    name: str | None = None
    role: str = "READ"
    permissions: int | None = None
    explicit: bool = False


class KnowledgeScope(_CamelModel):
    """note `/scope` 返回的检索范围。

    @author 称霸幼儿园
    """

    user_id: int
    admin: bool = False
    default_scope: bool = True
    knowledge_bases: list[ScopeKnowledgeBase] = Field(default_factory=list)

    @field_validator("knowledge_bases", mode="before")
    @classmethod
    def _coerce_list(cls, value: Any) -> Any:
        return [] if value is None else value

    def kb_name(self, kb_id: int | None) -> str | None:
        """按知识库 id 取名称。

        :param kb_id: 知识库 id
        :return: 名称，不在范围内时为空
        """
        for item in self.knowledge_bases:
            if item.kb_id == kb_id:
                return item.name
        return None

    @property
    def kb_ids(self) -> list[int]:
        """返回范围内的知识库 id。"""
        return [item.kb_id for item in self.knowledge_bases]


class AuthorizationItem(_CamelModel):
    """note `/authorize` 的单项结果。

    @author 称霸幼儿园
    """

    ref: str
    subtype: str | None = None
    readable: bool = False
    permission_basis: str | None = None
    kb_id: int | None = None
    mooc_id: int | None = None
    content_version: str | None = None
    meta_version: str | None = None

    @property
    def item_key(self) -> str:
        """返回与索引一致的条目键。"""
        return f"{self.ref}#{self.subtype}" if self.subtype else self.ref


class ContentResult(_CamelModel):
    """note `/content` 的正文片段。

    @author 称霸幼儿园
    """

    ref: str
    entity_type: str | None = None
    subtype: str | None = None
    kb_id: int | None = None
    title: str | None = None
    format: str | None = None
    authority: str | None = None
    content_version: str | None = None
    meta_version: str | None = None
    content: str = ""
    truncated: bool = False
    next_offset: int | None = None

    @field_validator("content", mode="before")
    @classmethod
    def _coerce_content(cls, value: Any) -> Any:
        return "" if value is None else value


class OutlineNode(_CamelModel):
    """目录或大纲节点。

    @author 称霸幼儿园
    """

    ref: str | None = None
    entity_type: str | None = None
    title: str | None = None
    parent_ref: str | None = None
    locator: dict[str, Any] | None = None
    update_time: datetime | int | str | None = None


class OutlineResult(_CamelModel):
    """note `/outline` 的分页结果。

    @author 称霸幼儿园
    """

    ref: str
    nodes: list[OutlineNode] = Field(default_factory=list)
    page_num: int = 1
    page_size: int = 50
    total: int = 0
    has_more: bool = False

    @field_validator("nodes", mode="before")
    @classmethod
    def _coerce_nodes(cls, value: Any) -> Any:
        return [] if value is None else value


class QueryRow(_CamelModel):
    """note `/query` 的结果行。

    @author 称霸幼儿园
    """

    ref: str
    entity_type: str | None = None
    subtype: str | None = None
    kb_id: int | None = None
    parent_ref: str | None = None
    title: str | None = None
    create_by: int | None = None
    create_time: datetime | int | str | None = None
    update_time: datetime | int | str | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)

    @field_validator("attributes", mode="before")
    @classmethod
    def _coerce_attributes(cls, value: Any) -> Any:
        return {} if value is None else value


class QueryResult(_CamelModel):
    """note `/query` 的结果。

    @author 称霸幼儿园
    """

    rows: list[QueryRow] = Field(default_factory=list)
    count: int | None = None

    @field_validator("rows", mode="before")
    @classmethod
    def _coerce_rows(cls, value: Any) -> Any:
        return [] if value is None else value


class StatsKnowledgeBase(_CamelModel):
    """note `/stats` 的单个知识库统计。

    @author 称霸幼儿园
    """

    kb_id: int
    name: str | None = None
    role: str | None = None
    counts: dict[str, int] = Field(default_factory=dict)
    latest_update_time: datetime | int | str | None = None

    @field_validator("counts", mode="before")
    @classmethod
    def _coerce_counts(cls, value: Any) -> Any:
        return {} if value is None else value


class StatsResult(_CamelModel):
    """note `/stats` 的结果。

    @author 称霸幼儿园
    """

    knowledge_bases: list[StatsKnowledgeBase] = Field(default_factory=list)

    @field_validator("knowledge_bases", mode="before")
    @classmethod
    def _coerce_list(cls, value: Any) -> Any:
        return [] if value is None else value


@dataclass
class ChunkHit:
    """索引中的一个片段或条目命中。

    @author 称霸幼儿园
    """

    item_key: str
    ref: str
    entity_type: str
    subtype: str | None
    kb_id: int | None
    title: str
    chunk_index: int | None = None
    content: str = ""
    section_path: str | None = None
    page_no: int | None = None
    start_ms: int | None = None
    end_ms: int | None = None
    start_line: int | None = None
    end_line: int | None = None
    authority: str = "original"
    content_version: str = ""
    content_mode: str | None = None
    page_count: int | None = None
    extraction_mode: str = "text"
    source_region_id: str | None = None
    highlight: str | None = None

    @property
    def key(self) -> str:
        """融合时使用的位置键：片段为 chunk_id，条目为首个片段。"""
        return f"{self.item_key}#{self.chunk_index if self.chunk_index is not None else 0}"


@dataclass
class FusedCandidate:
    """融合后的候选。

    @author 称霸幼儿园
    """

    hit: ChunkHit
    score: float
    ranks: dict[str, int] = field(default_factory=dict)
