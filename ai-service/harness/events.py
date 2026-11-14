"""运行事件模型、队列与 SSE 编码。

@author 称霸幼儿园
"""

import asyncio
import json
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class RunEvent(BaseModel):
    """统一事件信封。

    @author 称霸幼儿园
    """

    seq: int
    run_id: str
    ts: datetime
    type: str
    data: dict[str, Any]

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class EventBus:
    """为单次运行生成单调递增事件并支持心跳。

    @author 称霸幼儿园
    """

    def __init__(self, run_id: str, heartbeat_interval_s: float = 5.0):
        self._run_id = run_id
        self._heartbeat_interval_s = heartbeat_interval_s
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        self._sequence = 0
        self._closed = False

    async def emit(self, event_type: str, data: dict[str, Any] | None = None) -> RunEvent:
        """生成并发布事件。

        :param event_type: 事件类型
        :param data: 事件数据
        :return: 完整事件
        """
        self._sequence += 1
        event = RunEvent(
            seq=self._sequence,
            run_id=self._run_id,
            ts=datetime.now(UTC),
            type=event_type,
            data=data or {},
        )
        if not self._closed:
            await self._queue.put(event)
        return event

    async def close(self) -> None:
        """标记事件流结束。"""
        if not self._closed:
            self._closed = True
            await self._queue.put(None)

    async def events(self):
        """逐条读取事件，空闲时产生心跳。"""
        while True:
            try:
                event = await asyncio.wait_for(
                    self._queue.get(),
                    timeout=self._heartbeat_interval_s,
                )
            except TimeoutError:
                await self.emit("heartbeat")
                continue
            if event is None:
                break
            yield event

    @staticmethod
    def encode_sse(event: RunEvent) -> bytes:
        """将事件编码为一个 SSE 帧。

        :param event: 运行事件
        :return: UTF-8 SSE 字节
        """
        payload = event.model_dump_json(by_alias=True)
        return f"id: {event.seq}\nevent: {event.type}\ndata: {payload}\n\n".encode("utf-8")

    @staticmethod
    def decode_data(payload: str) -> RunEvent:
        """解析 SSE data 中的事件信封。

        :param payload: JSON 字符串
        :return: 运行事件
        """
        return RunEvent.model_validate(json.loads(payload))
