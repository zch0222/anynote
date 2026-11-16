"""单次运行内的证据编号与按位置去重。

@author 称霸幼儿园
"""

import json
from typing import Any

from harness.models import EvidenceItem


class EvidenceRegistry:
    """为同一运行分配 E1、E2… 编号，同一位置多次命中复用同一编号。

    @author 称霸幼儿园
    """

    def __init__(self):
        self._ids: dict[str, str] = {}
        self._items: dict[str, EvidenceItem] = {}
        self._mooc_ids: dict[str, int] = {}

    def set_mooc_id(self, item_key: str, mooc_id: int | None) -> None:
        """登记权限确认后的慕课定位。

        :param item_key: 条目引用
        :param mooc_id: 所属慕课标识
        """
        if mooc_id is not None and mooc_id > 0:
            self._mooc_ids[item_key] = mooc_id

    @staticmethod
    def position_key(item_key: str, locator: dict[str, Any] | None) -> str:
        """生成位置键：条目键加规范化定位符。

        :param item_key: 条目键，如 note:1 或 mooc_item:5#transcript
        :param locator: 定位符
        :return: 位置键
        """
        normalized = json.dumps(locator or {}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return f"{item_key}|{normalized}"

    def register(
        self,
        *,
        item_key: str,
        entity_type: str,
        text: str,
        title: str | None,
        locator: dict[str, Any] | None,
        kb_id: int | None,
        kb_name: str | None,
        authority: str | None,
        content_version: str | None,
        stale: bool,
        permission_basis: str | None,
        retrieval: dict[str, Any] | None,
        selected_reason: str,
    ) -> EvidenceItem:
        """登记一条证据；位置已存在时返回已有证据，不覆盖其内容。

        :param item_key: 条目键
        :param entity_type: 实体类型
        :param text: 证据正文
        :param title: 标题
        :param locator: 定位符
        :param kb_id: 所属知识库
        :param kb_name: 知识库名称
        :param authority: original、transcript 或 generated
        :param content_version: 内容版本
        :param stale: 索引是否落后于当前版本
        :param permission_basis: 可读依据
        :param retrieval: 命中通道、排名与分数
        :param selected_reason: 进入上下文的原因
        :return: 证据条目
        """
        mooc_id = self._mooc_ids.get(item_key)
        if mooc_id is not None:
            locator = {**(locator or {}), "moocId": mooc_id}
        key = self.position_key(item_key, locator)
        existing_id = self._ids.get(key)
        if existing_id is not None:
            return self._items[existing_id]
        evidence_id = f"E{len(self._ids) + 1}"
        item = EvidenceItem(
            evidence_id=evidence_id,
            source_type=entity_type,
            source_id=item_key,
            content=text,
            version=content_version or None,
            permission_basis=permission_basis,
            selected_reason=selected_reason,
            title=title,
            locator=locator,
            kb_id=kb_id,
            kb_name=kb_name,
            authority=authority,
            stale=stale,
            retrieval=retrieval,
        )
        self._ids[key] = evidence_id
        self._items[evidence_id] = item
        return item

    def __len__(self) -> int:
        return len(self._ids)
