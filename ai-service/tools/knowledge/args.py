"""八个知识工具的参数模型。

@author 称霸幼儿园
"""

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

REF_PATTERN = r"^(kb|note|doc|mooc|mooc_item|task|notice):[1-9]\d*$"
EntityType = Literal["kb", "note", "doc", "mooc", "mooc_item", "transcript", "summary", "task"]
Subtype = Literal["transcript", "summary"]


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


class KbListArgs(_Args):
    """`kb_list` 无参数。

    @author 称霸幼儿园
    """


class KbOutlineArgs(_Args):
    """`kb_outline` 参数。

    @author 称霸幼儿园
    """

    ref: str = Field(pattern=REF_PATTERN, description="知识库、慕课、笔记、文档类条目或资料的引用，如 kb:3、mooc:2、note:12、doc:5")
    parent_id: int | None = Field(default=None, ge=0, description="慕课目录中要展开的上级条目 id，缺省为顶层")
    depth: int = Field(default=1, ge=1, le=3, description="知识库或慕课目录向下展开的层数")
    page_num: int = Field(default=1, ge=1, description="页码，从 1 开始")
    page_size: int = Field(default=50, ge=1, le=100, description="每页节点数")


class KbSearchArgs(_Args):
    """`kb_search` 参数。

    @author 称霸幼儿园
    """

    query: str = Field(min_length=1, max_length=500, description="检索语句；用引号包住必须原样出现的原话")
    kb_ids: list[int] = Field(default_factory=list, description="只在这些知识库内检索，只能缩小本次运行的范围")
    entity_types: list[EntityType] = Field(default_factory=list, description="只检索这些实体类型")
    granularity: Literal["chunk", "item"] = Field(default="chunk", description="chunk 返回片段，item 每个实体只返回一条")
    updated_after: date | None = Field(default=None, description="只要该日期（含）之后更新的内容")
    updated_before: date | None = Field(default=None, description="只要该日期之前更新的内容")
    limit: int | None = Field(default=None, ge=1, le=50, description="返回条数，超过上限时按上限")
    mode: Literal["auto", "keyword", "semantic"] = Field(default="auto", description="auto 按查询特征自动加权，keyword 只用关键词，semantic 只用语义")

    @model_validator(mode="after")
    def _date_order(self) -> "KbSearchArgs":
        if self.updated_after and self.updated_before and self.updated_after >= self.updated_before:
            raise ValueError("updated_after must be earlier than updated_before")
        return self


class KbGrepArgs(_Args):
    """`kb_grep` 参数。

    @author 称霸幼儿园
    """

    pattern: str = Field(min_length=1, max_length=200, description="要查找的字面字符串，不支持正则")
    ref: str | None = Field(default=None, pattern=REF_PATTERN, description="在这个实体内查找，与 kb_id 二选一")
    subtype: Subtype | None = Field(default=None, description="视频条目的附属内容：transcript 字幕或 summary 总结")
    kb_id: int | None = Field(default=None, ge=1, description="在这个知识库内查找，与 ref 二选一")
    ignore_case: bool = Field(default=True, description="是否忽略大小写")
    context_lines: int | None = Field(default=None, ge=0, le=10, description="命中行前后各带几行，超过上限时按上限")

    @model_validator(mode="after")
    def _one_scope(self) -> "KbGrepArgs":
        if (self.ref is None) == (self.kb_id is None):
            raise ValueError("exactly one of ref and kb_id is required")
        if self.subtype is not None and self.ref is None:
            raise ValueError("subtype requires ref")
        return self


class KbReadArgs(_Args):
    """`kb_read` 参数。

    @author 称霸幼儿园
    """

    ref: str = Field(pattern=REF_PATTERN, description="要读取的实体引用")
    subtype: Subtype | None = Field(default=None, description="视频条目的附属内容：transcript 字幕或 summary 总结")
    heading: str | None = Field(default=None, min_length=1, max_length=200, description="笔记或文档类条目中要读取的标题（不含 #）")
    start_line: int | None = Field(default=None, ge=1, description="起始行（含），从 1 开始")
    end_line: int | None = Field(default=None, ge=1, description="结束行（含）")
    start_page: int | None = Field(default=None, ge=1, description="资料的起始页（含）")
    end_page: int | None = Field(default=None, ge=1, description="资料的结束页（含）")
    start_time_ms: int | None = Field(default=None, ge=0, description="字幕的起始毫秒（含）")
    end_time_ms: int | None = Field(default=None, ge=0, description="字幕的结束毫秒（含）")
    offset: int = Field(default=0, ge=0, description="续读位置，使用上次返回的 nextOffset")

    @model_validator(mode="after")
    def _single_range(self) -> "KbReadArgs":
        kinds = [
            self.heading is not None,
            self.start_line is not None or self.end_line is not None,
            self.start_page is not None or self.end_page is not None,
            self.start_time_ms is not None or self.end_time_ms is not None,
        ]
        if sum(kinds) > 1:
            raise ValueError("heading, line range, page range and time range are mutually exclusive")
        for start, end in ((self.start_line, self.end_line), (self.start_page, self.end_page),
                           (self.start_time_ms, self.end_time_ms)):
            if start is not None and end is not None and start > end:
                raise ValueError("range start must not exceed range end")
        return self


class KbQueryArgs(_Args):
    """`kb_query` 参数。

    @author 称霸幼儿园
    """

    entity: EntityType = Field(description="查询的实体类型")
    query_name: Literal["MY_TASKS"] | None = Field(default=None, description="命名查询；MY_TASKS 为我的任务及提交状态，entity 必须为 task")
    kb_ids: list[int] = Field(default_factory=list, description="只查这些知识库，只能缩小本次运行的范围")
    filters: dict[str, Any] = Field(default_factory=dict, description="过滤条件：titleContains、createdBy=me、createdAfter、createdBefore、updatedAfter、updatedBefore 及实体专用字段")
    sort: str | None = Field(default=None, max_length=40, description="排序，如 updatedAt:desc")
    limit: int = Field(default=20, ge=1, le=100, description="返回行数")
    with_count: bool = Field(default=False, description="是否返回总数；回答「有多少」时设为 true")


class KbRelatedArgs(_Args):
    """`kb_related` 参数。

    @author 称霸幼儿园
    """

    ref: str = Field(pattern=REF_PATTERN, description="起点实体引用")
    subtype: Subtype | None = Field(default=None, description="视频条目的附属内容")
    relation: Literal["contains", "children", "attachments", "submission", "links", "siblings"] = Field(
        description="contains 知识库包含的内容；children 慕课或章节的下级条目；attachments 视频条目的字幕与总结；"
        "submission 我在该任务中提交的笔记；links 笔记正文链接到的笔记；siblings 同一上级下的其他实体"
    )
    page_num: int = Field(default=1, ge=1, description="页码，从 1 开始")
    page_size: int = Field(default=20, ge=1, le=100, description="每页条数")


class KbViewDocArgs(_Args):
    """`kb_view_doc` 按页读取 PDF 图像的参数。

    @author 称霸幼儿园
    """

    ref: str = Field(pattern=r"^doc:[1-9]\d*$", description="要读取页面图像的资料引用，如 doc:5")
    start_page: int = Field(alias="startPage", description="起始页（含），从 1 开始")
    end_page: int | None = Field(default=None, alias="endPage", description="结束页（含），缺省等于起始页")

    model_config = ConfigDict(extra="forbid", populate_by_name=True)
