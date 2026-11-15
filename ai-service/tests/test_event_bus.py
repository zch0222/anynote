"""EventBus 首事件与心跳时序测试。

@author 称霸幼儿园
"""

import asyncio

import pytest

from harness.events import EventBus


async def test_first_non_heartbeat_event_precedes_all_heartbeats():
    """首事件前等待不产生心跳，首事件后恢复周期心跳。"""
    bus = EventBus("run-events", heartbeat_interval_s=0.01)
    events = bus.events()
    first_event = asyncio.create_task(anext(events))

    await asyncio.sleep(0.03)
    assert first_event.done() is False

    await bus.emit("run.started", {"agent": "knowledge-retrieval"})
    assert (await first_event).type == "run.started"
    assert (await asyncio.wait_for(anext(events), timeout=0.1)).type == "heartbeat"

    await bus.close()
    with pytest.raises(StopAsyncIteration):
        await anext(events)
