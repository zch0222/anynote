import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const meState = vi.hoisted(() => ({
  current: { data: { id: 7 } as { id?: number } | undefined },
}));
vi.mock("@/features/auth/use-me", () => ({ useMe: () => meState.current }));

import { saveSidePanelState, useSidePanelPersistence } from "../persistence";
import { emptySurface, useSidePanelStore } from "../store";
import { type SurfaceState, asTabId } from "../types";

/**
 * 侧栏持久化 hook 的账号隔离测试。
 *
 * @author 称霸幼儿园
 */
function noteSurface(id: number): SurfaceState {
  const surface = emptySurface();
  surface.open = true;
  surface.tabs = [
    {
      id: asTabId("t1"),
      kind: "note",
      family: "resource",
      ref: { type: "note", id, kbId: 3 },
    },
  ];
  surface.activeId = asTabId("t1");
  surface.recent = [asTabId("t1")];
  surface.seq = 1;
  surface.touchedAt = 1;
  return surface;
}

beforeEach(() => {
  localStorage.clear();
  meState.current = { data: { id: 7 } };
  useSidePanelStore.setState({ surfaces: {}, guards: {}, newWindowHandlers: {} });
});

describe("侧栏持久化 hook", () => {
  /** 账号从 A 切到 B 时清空 A 的内存分区并恢复 B 的标签。 */
  it("切换账号隔离内存状态", () => {
    const { rerender } = renderHook(() => useSidePanelPersistence({}));
    useSidePanelStore.setState({
      surfaces: { "chat:c7": noteSurface(1) },
      guards: {},
      newWindowHandlers: {},
    });
    saveSidePanelState(8, { "chat:c8": noteSurface(2) });

    meState.current = { data: { id: 8 } };
    rerender();

    const surfaces = useSidePanelStore.getState().surfaces;
    expect(surfaces["chat:c7"]).toBeUndefined();
    expect(surfaces["chat:c8"]?.tabs[0]).toMatchObject({
      ref: { type: "note", id: 2 },
    });
  });

  /** 用户 id 变为空时清空内存分区。 */
  it("用户 id 变为空时清空内存", () => {
    const { rerender } = renderHook(() => useSidePanelPersistence({}));
    useSidePanelStore.setState({
      surfaces: { "chat:c7": noteSurface(1) },
      guards: {},
      newWindowHandlers: {},
    });

    meState.current = { data: undefined };
    rerender();

    expect(useSidePanelStore.getState().surfaces).toEqual({});
  });
});
