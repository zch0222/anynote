"""Context Manifest 数据模型。

@author 称霸幼儿园
"""

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ManifestEntry(BaseModel):
    """一项上下文材料的来源与处理记录。

    content 是该层原文，不参与序列化，只供 Trace 按哈希写入 blobs。

    @author 称霸幼儿园
    """

    source_type: str
    source_id: str
    scope: str
    version: str
    trust_level: str
    permission_basis: str | None = None
    selected_reason: str
    token_count: int
    transform: str
    content_hash: str
    content: str | None = Field(default=None, exclude=True)

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        protected_namespaces=(),
    )


class ContextManifest(BaseModel):
    """一次模型调用的完整上下文清单。

    @author 称霸幼儿园
    """

    run_id: str
    model_turn: int
    entries: list[ManifestEntry]
    token_count: int

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        protected_namespaces=(),
    )
