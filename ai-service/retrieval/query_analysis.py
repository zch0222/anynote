"""确定性的查询特征分析：决定全文与语义通道的权重。

@author 称霸幼儿园
"""

import re
from dataclasses import dataclass, field

from retrieval.settings import RetrievalSettings

KIND_KEYWORD = "keyword"
KIND_QUESTION = "question"
KIND_DEFAULT = "default"
MODE_AUTO = "auto"
MODE_KEYWORD = "keyword"
MODE_SEMANTIC = "semantic"

_QUOTED_RE = re.compile(r"[\"“”「」『』]([^\"“”「」『』]{1,200})[\"“”「」『』]")
_LONG_NUMBER_RE = re.compile(r"\d{4,}")
_CODE_LIKE_RE = re.compile(r"[A-Za-z_][\w]*[._:/\\#(){}\[\]<>=+\-*]+[\w]*|[A-Za-z]+\d+[A-Za-z\d]*|\w+_\w+")
_QUESTION_MARKERS = ("?", "？", "什么", "为什么", "怎么", "如何", "哪些", "哪个", "是否", "吗", "呢")
_QUESTION_MIN_CHARS = 8


@dataclass
class QueryFeatures:
    """查询特征与通道权重。

    @author 称霸幼儿园
    """

    kind: str
    phrases: list[str] = field(default_factory=list)
    lexical_weight: float = 1.0
    semantic_weight: float = 1.0
    signals: list[str] = field(default_factory=list)


def extract_phrases(query: str) -> list[str]:
    """提取引号中的原话。

    :param query: 用户查询
    :return: 去重后的短语列表
    """
    phrases: list[str] = []
    for match in _QUOTED_RE.finditer(query or ""):
        phrase = match.group(1).strip()
        if phrase and phrase not in phrases:
            phrases.append(phrase)
    return phrases


def analyze_query(query: str, settings: RetrievalSettings, mode: str = MODE_AUTO) -> QueryFeatures:
    """按规则判定查询类型并给出各通道权重。

    带引号、含长数字或代码样式、或很短的关键词判为关键词型；完整的自然语言问句判为问句型。
    调用方显式指定 keyword 或 semantic 时只保留对应通道。

    :param query: 用户查询
    :param settings: 检索参数
    :param mode: auto、keyword 或 semantic
    :return: 查询特征
    """
    text = (query or "").strip()
    phrases = extract_phrases(text)
    signals: list[str] = []
    if phrases:
        signals.append("quoted")
    if _LONG_NUMBER_RE.search(text):
        signals.append("long_number")
    if _CODE_LIKE_RE.search(text):
        signals.append("code_like")
    compact = re.sub(r"\s+", "", text)
    if len(compact) <= settings.short_keyword_chars:
        signals.append("short")
    if signals:
        kind = KIND_KEYWORD
        lexical, semantic = settings.keyword_lexical_weight, settings.keyword_semantic_weight
    elif len(compact) >= _QUESTION_MIN_CHARS and any(marker in text for marker in _QUESTION_MARKERS):
        kind = KIND_QUESTION
        lexical, semantic = settings.question_lexical_weight, settings.question_semantic_weight
    else:
        kind = KIND_DEFAULT
        lexical, semantic = settings.default_lexical_weight, settings.default_semantic_weight
    if mode == MODE_KEYWORD:
        semantic = 0.0
    elif mode == MODE_SEMANTIC:
        lexical = 0.0
    return QueryFeatures(
        kind=kind,
        phrases=phrases,
        lexical_weight=lexical,
        semantic_weight=semantic,
        signals=signals,
    )
