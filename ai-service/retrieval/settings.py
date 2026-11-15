"""随模型快照下发的检索运行参数。

@author 称霸幼儿园
"""

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

AUTHORIZE_BATCH_SIZE = 100


class RetrievalSettings(BaseModel):
    """一次运行固定使用的检索参数，缺省值与 services/ai 的默认值一致。

    @author 称霸幼儿园
    """

    rrf_k: int = Field(default=60, ge=1, le=1000)
    channel_candidates: int = Field(default=50, ge=10, le=200)
    keyword_lexical_weight: float = Field(default=1.5, ge=0, le=5)
    keyword_semantic_weight: float = Field(default=0.5, ge=0, le=5)
    question_lexical_weight: float = Field(default=1.0, ge=0, le=5)
    question_semantic_weight: float = Field(default=1.2, ge=0, le=5)
    default_lexical_weight: float = Field(default=1.0, ge=0, le=5)
    default_semantic_weight: float = Field(default=1.0, ge=0, le=5)
    item_weight: float = Field(default=0.8, ge=0, le=5)
    authority_original: float = Field(default=1.0, ge=0, le=5)
    authority_transcript: float = Field(default=0.9, ge=0, le=5)
    authority_generated: float = Field(default=0.7, ge=0, le=5)
    max_chunks_per_entity: int = Field(default=3, ge=1, le=10)
    search_default_limit: int = Field(default=10, ge=1, le=50)
    search_max_limit: int = Field(default=20, ge=1, le=50)
    neighbor_window: int = Field(default=1, ge=0, le=3)
    neighbor_max_chars: int = Field(default=6000, ge=0, le=20000)
    read_max_chars: int = Field(default=2000, ge=500, le=20000)
    grep_max_hits: int = Field(default=50, ge=1, le=200)
    grep_context_default: int = Field(default=2, ge=0, le=5)
    grep_context_max: int = Field(default=5, ge=0, le=10)
    grep_kb_candidates: int = Field(default=20, ge=1, le=50)
    short_keyword_chars: int = Field(default=4, ge=1, le=20)
    rerank_enabled: bool = False
    version: int = 0

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")

    def authority_factor(self, authority: str | None) -> float:
        """返回权威性系数。

        :param authority: original、transcript 或 generated
        :return: 系数，未知取值按原始内容
        """
        if authority == "transcript":
            return self.authority_transcript
        if authority == "generated":
            return self.authority_generated
        return self.authority_original
