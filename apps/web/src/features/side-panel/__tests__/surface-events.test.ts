import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 侧栏事件桥测试：处理器由侧栏状态模块加载时登记，不依赖宿主挂载。
 *
 * @author 称霸幼儿园
 */
beforeEach(() => {
  vi.resetModules();
});

describe("surface-events", () => {
  /** 状态模块未加载时，通知为空操作且离开检查直接放行。 */
  it("状态模块未加载时通知为空操作且放行离开", async () => {
    const events = await import("../surface-events");
    expect(() => events.notifyConversationRemoved(7)).not.toThrow();
    expect(() => events.removeSidePanelSurface("chat:c7")).not.toThrow();
    expect(() => events.renameSidePanelSurface("chat:c1", "chat:c9")).not.toThrow();
    expect(events.requestSidePanelLeave("chat:c1")).toBe(true);
  });

  /** 状态模块登记后，不挂宿主也能走离开守卫、分区迁移与移除。 */
  it("状态模块登记后处理守卫、迁移与移除", async () => {
    const events = await import("../surface-events");
    const { emptySurface, useSidePanelStore } = await import("../store");
    const { asTabId } = await import("../types");

    const surface = emptySurface();
    surface.open = true;
    surface.tabs = [
      {
        id: asTabId("t1"),
        kind: "note",
        family: "resource",
        ref: { type: "note", id: 1, kbId: 3 },
      },
    ];
    surface.activeId = asTabId("t1");
    surface.recent = [asTabId("t1")];
    surface.seq = 1;
    const guard = vi.fn(() => false);
    useSidePanelStore.setState({
      surfaces: { "chat:c1": surface },
      guards: { "chat:c1": guard },
      newWindowHandlers: {},
    });

    expect(events.requestSidePanelLeave("chat:c1")).toBe(false);
    guard.mockReturnValue(true);
    expect(events.requestSidePanelLeave("chat:c1")).toBe(true);

    events.renameSidePanelSurface("chat:c1", "chat:c9");
    expect(useSidePanelStore.getState().surfaces["chat:c9"]).toBeDefined();
    expect(useSidePanelStore.getState().surfaces["chat:c1"]).toBeUndefined();
    expect(useSidePanelStore.getState().guards["chat:c9"]).toBe(guard);

    events.notifyConversationRemoved(9);
    expect(useSidePanelStore.getState().surfaces["chat:c9"]).toBeUndefined();
    expect(useSidePanelStore.getState().guards["chat:c9"]).toBeUndefined();
  });
});
