"""运行过程内部事件与用户视图投影的模型。

@author 称霸幼儿园
"""

from dataclasses import dataclass, field
from typing import Any

from harness.models import EvidenceItem


@dataclass
class ReasoningBlock:
    """一个思考块：从首个推理增量到块结束。

    @author 称霸幼儿园
    """

    block_id: str
    turn: int
    text: list[str] = field(default_factory=list)
    started: float = 0.0
    finished: float | None = None
    status: str = "streaming"

    def append(self, delta: str, now: float) -> None:
        """记录一段思考增量。

        :param delta: 思考增量
        :param now: 当前单调时钟
        """
        self.text.append(delta)
        if self.status == "streaming":
            self.started = self.started or now

    def close(self, now: float, status: str) -> None:
        """结束思考块。

        :param now: 当前单调时钟
        :param status: done 或 interrupted
        """
        self.finished = now
        self.status = status

    @property
    def content(self) -> str:
        """返回思考全文。"""
        return "".join(self.text)

    @property
    def duration_ms(self) -> int:
        """返回思考块耗时毫秒。"""
        if self.finished is None:
            return 0
        return int((self.finished - self.started) * 1000)


@dataclass
class ToolCallRecord:
    """一次工具调用的内部记录，供投影使用。

    @author 称霸幼儿园
    """

    call_id: str
    name: str
    arguments: dict[str, Any]
    started: float = 0.0
    status: str | None = None
    duration_ms: int = 0
    error_category: str | None = None
    retryable: bool = False
    content: str = ""
    evidence: list[EvidenceItem] = field(default_factory=list)
    diagnostics: dict[str, Any] = field(default_factory=dict)
    error_message: str | None = None


@dataclass
class ModelTurnRecord:
    """一个模型轮的内部记录。

    @author 称霸幼儿园
    """

    turn: int
    logical_name: str
    provider: str = ""
    model: str = ""
    started: float = 0.0
    first_output: float | None = None
    finished: float | None = None
    attempts: int = 1
    reasoning_blocks: list[ReasoningBlock] = field(default_factory=list)
    draft: str = ""
    step_note: str | None = None
    end_reason: str | None = None

    @property
    def duration_ms(self) -> int:
        """返回模型轮耗时毫秒。"""
        if self.finished is None:
            return 0
        return int((self.finished - self.started) * 1000)

    @property
    def reasoning_text(self) -> str:
        """返回本轮思考全文。"""
        return "".join(block.content for block in self.reasoning_blocks)


@dataclass
class VisibleSet:
    """用户视图中允许出现的实体名称集合，由 Python 在运行中维护。

    @author 称霸幼儿园
    """

    kb_names: dict[int, str] = field(default_factory=dict)
    entity_titles: dict[str, str] = field(default_factory=dict)
    entity_locators: dict[str, dict[str, Any]] = field(default_factory=dict)

    def put_kb(self, kb_id: int | None, name: str | None) -> None:
        """登记一个可见知识库。

        :param kb_id: 知识库标识
        :param name: 知识库名称
        """
        if kb_id is not None and name:
            self.kb_names.setdefault(kb_id, name)

    def put_entity(
        self,
        item_key: str,
        title: str | None,
        locator: dict[str, Any] | None = None,
    ) -> None:
        """登记一个可见实体。

        :param item_key: 实体键，如 note:1 或 mooc_item:5#transcript
        :param title: 实体标题
        :param locator: 定位符
        """
        if title:
            self.entity_titles.setdefault(item_key, title)
        if locator:
            self.entity_locators.setdefault(item_key, locator)

    def title_of(self, item_key: str) -> str | None:
        """返回可见实体的标题。

        :param item_key: 实体键
        :return: 标题，不可见时为空
        """
        return self.entity_titles.get(item_key)

    def kb_name_of(self, kb_id: int | None) -> str | None:
        """返回可见知识库名称。

        :param kb_id: 知识库标识
        :return: 名称，不可见时为空
        """
        return self.kb_names.get(kb_id) if kb_id is not None else None
