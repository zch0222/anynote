import type { ResourceTarget } from "@/lib/ai/resource-target";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TABS, emptySurface, resetSidePanelState, useSidePanelStore } from "../store";
import type { TabId } from "../types";

/**
 * 侧栏标签状态与动作测试。
 *
 * @author 称霸幼儿园
 */
const SURFACE = "chat:c1";

function note(id: number, kbId = 3, section?: string): ResourceTarget {
  return {
    ref: { type: "note", id, kbId },
    locator: section ? { section } : {},
  };
}

function state() {
  return useSidePanelStore.getState().surfaces[SURFACE] ?? emptySurface();
}

beforeEach(() => {
  useSidePanelStore.setState({ surfaces: {}, guards: {}, newWindowHandlers: {} });
});

describe("侧栏 store", () => {
  /** 新资源插入并激活，侧栏展开。 */
  it("打开新资源", () => {
    useSidePanelStore.getState().openResource(SURFACE, note(1, 3, "第一章"));
    const surface = state();
    expect(surface.open).toBe(true);
    expect(surface.tabs).toHaveLength(1);
    expect(surface.activeId).toBe(surface.tabs[0]?.id);
    expect(surface.navigation[surface.tabs[0]?.id ?? ""]).toEqual({
      locator: { section: "第一章" },
      revision: 1,
    });
  });

  /** 同一资源只开一个标签，再次打开替换定位并递增导航版本。 */
  it("同一资源去重并推进导航版本", () => {
    const store = useSidePanelStore.getState();
    store.openResource(SURFACE, note(1, 3, "第一章"));
    const tabId = state().tabs[0]?.id ?? "";
    store.openResource(SURFACE, note(1, 3, "第二章"));
    expect(state().tabs).toHaveLength(1);
    expect(state().activeId).toBe(tabId);
    expect(state().navigation[tabId]).toEqual({
      locator: { section: "第二章" },
      revision: 2,
    });
  });

  /** 新标签插在当前活动标签右侧。 */
  it("在当前标签右侧插入", () => {
    const store = useSidePanelStore.getState();
    store.openResource(SURFACE, note(1));
    store.openResource(SURFACE, note(2));
    const first = state().tabs[0]?.id ?? "";
    store.activate(SURFACE, first as TabId);
    store.openResource(SURFACE, note(3));
    expect(state().tabs.map((tab) => tab.family === "resource" && tab.ref.id)).toEqual([1, 3, 2]);
  });

  /** 第 11 个标签淘汰最久未用的非活动标签。 */
  it("超限淘汰最久未用的非活动标签", () => {
    const store = useSidePanelStore.getState();
    for (let id = 1; id <= MAX_TABS; id += 1) store.openResource(SURFACE, note(id));
    const fifth = state().tabs[4]?.id ?? "";
    store.activate(SURFACE, fifth as TabId);
    store.openResource(SURFACE, note(MAX_TABS + 1));
    const surface = state();
    expect(surface.tabs).toHaveLength(MAX_TABS);
    expect(surface.tabs.some((tab) => tab.family === "resource" && tab.ref.id === 1)).toBe(false);
    expect(surface.tabs.some((tab) => tab.family === "resource" && tab.ref.id === 5)).toBe(true);
    expect(surface.tabs.some((tab) => tab.family === "resource" && tab.ref.id === 11)).toBe(true);
    expect(surface.activeId).toBe(
      surface.tabs.find((tab) => tab.family === "resource" && tab.ref.id === 11)?.id,
    );
  });

  /** 关闭活动标签后激活最近使用的另一个；关闭最后一个收起侧栏。 */
  it("关闭标签", () => {
    const store = useSidePanelStore.getState();
    store.openResource(SURFACE, note(1));
    store.openResource(SURFACE, note(2));
    const second = state().activeId as TabId;
    store.close(SURFACE, second);
    expect(state().tabs).toHaveLength(1);
    expect(state().activeId).toBe(state().tabs[0]?.id);
    const last = state().activeId as TabId;
    store.close(SURFACE, last);
    expect(state().tabs).toHaveLength(0);
    expect(state().activeId).toBeNull();
    expect(state().open).toBe(false);
  });

  /** 守卫返回 false 时切换、关闭、收起与打开别的资源都不改变状态。 */
  it("守卫阻止卸载活动正文", () => {
    const store = useSidePanelStore.getState();
    store.openResource(SURFACE, note(1));
    store.openResource(SURFACE, note(2));
    const first = state().tabs[0]?.id ?? "";
    const second = (state().tabs[1]?.id ?? "") as TabId;
    const guard = vi.fn(() => false);
    const unregister = store.registerGuard(SURFACE, guard);

    store.activate(SURFACE, first as TabId);
    expect(state().activeId).toBe(second);
    store.close(SURFACE, second);
    expect(state().tabs).toHaveLength(2);
    store.setOpen(SURFACE, false);
    expect(state().open).toBe(true);
    store.openResource(SURFACE, note(3));
    expect(state().tabs).toHaveLength(2);

    guard.mockReturnValue(true);
    store.activate(SURFACE, first as TabId);
    expect(state().activeId).toBe(first);
    unregister();
  });

  /** 程序化导航前通过 store 请求离开，与切换标签使用同一个守卫。 */
  it("请求离开调用守卫", () => {
    const store = useSidePanelStore.getState();
    store.openResource(SURFACE, note(1));
    expect(store.requestLeave(SURFACE)).toBe(true);
    const guard = vi.fn(() => false);
    const unregister = store.registerGuard(SURFACE, guard);
    expect(store.requestLeave(SURFACE)).toBe(false);
    guard.mockReturnValue(true);
    expect(store.requestLeave(SURFACE)).toBe(true);
    unregister();
  });

  /** 同一标签内换定位不调用守卫。 */
  it("同一标签换定位不调守卫", () => {
    const store = useSidePanelStore.getState();
    store.openResource(SURFACE, note(1, 3, "第一章"));
    const guard = vi.fn(() => false);
    const unregister = store.registerGuard(SURFACE, guard);
    store.openResource(SURFACE, note(1, 3, "第二章"));
    expect(guard).not.toHaveBeenCalled();
    expect(state().navigation[state().activeId ?? ""]?.revision).toBe(2);
    unregister();
  });

  /** 页面类标签按 multiple 决定去重或新建。 */
  it("页面类标签", () => {
    const store = useSidePanelStore.getState();
    store.openPage(SURFACE, "summary", "c1");
    store.openPage(SURFACE, "summary", "c1");
    expect(state().tabs).toHaveLength(1);
    store.openPage(SURFACE, "summary", "c1", true);
    expect(state().tabs).toHaveLength(2);
    store.openPage(SURFACE, "summary", "c2");
    expect(state().tabs).toHaveLength(3);
  });

  /** 分区迁移保留标签、最近使用与活动标签。 */
  it("迁移分区", () => {
    const store = useSidePanelStore.getState();
    store.openResource(SURFACE, note(1));
    store.openResource(SURFACE, note(2));
    const before = state();
    store.renameSurface(SURFACE, "chat:c2");
    expect(useSidePanelStore.getState().surfaces[SURFACE]).toBeUndefined();
    expect(useSidePanelStore.getState().surfaces["chat:c2"]?.tabs).toEqual(before.tabs);
    expect(useSidePanelStore.getState().surfaces["chat:c2"]?.activeId).toBe(before.activeId);
  });

  /** 删除会话时移除分区。 */
  it("移除分区", () => {
    const store = useSidePanelStore.getState();
    store.openResource(SURFACE, note(1));
    store.removeSurface(SURFACE);
    expect(useSidePanelStore.getState().surfaces[SURFACE]).toBeUndefined();
  });

  /** 登出重置清空分区、守卫与新窗口处理器。 */
  it("重置内存状态", () => {
    const store = useSidePanelStore.getState();
    store.openResource(SURFACE, note(1));
    store.registerGuard(SURFACE, () => true);
    store.registerNewWindow(SURFACE, () => {});
    resetSidePanelState();
    const state = useSidePanelStore.getState();
    expect(state.surfaces).toEqual({});
    expect(state.guards).toEqual({});
    expect(state.newWindowHandlers).toEqual({});
  });

  /** 恢复状态时按需忽略展开标志，且不覆盖内存里已有分区。 */
  it("恢复持久化状态", () => {
    const store = useSidePanelStore.getState();
    const persisted = emptySurface();
    persisted.open = true;
    persisted.tabs = [
      {
        id: "t1" as TabId,
        kind: "note",
        family: "resource",
        ref: { type: "note", id: 9, kbId: 3 },
      },
    ];
    persisted.activeId = "t1" as TabId;
    persisted.recent = ["t1" as TabId];
    persisted.seq = 1;
    store.hydrate({ [SURFACE]: persisted }, { ignoreOpen: true });
    expect(state().tabs).toHaveLength(1);
    expect(state().open).toBe(false);

    store.hydrate(
      {
        [SURFACE]: { ...persisted, tabs: [] },
        "chat:c9": persisted,
      },
      {},
    );
    expect(state().tabs).toHaveLength(1);
    expect(useSidePanelStore.getState().surfaces["chat:c9"]?.open).toBe(true);
  });
});
