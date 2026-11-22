import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/notes/use-note", () => ({
  useNoteQuery: (id: number) => ({ data: { title: `笔记 ${id}` }, error: null }),
}));

import { TabBar } from "@/features/side-panel/desktop/tab-bar";
import { useSidePanelStore } from "@/features/side-panel/store";
import type { TabId } from "@/features/side-panel/types";

/**
 * 标签条交互测试。
 *
 * @author 称霸幼儿园
 */
const SURFACE = "chat:c1";

function setup() {
  const store = useSidePanelStore.getState();
  store.openResource(SURFACE, { ref: { type: "note", id: 1, kbId: 3 }, locator: {} });
  store.openResource(SURFACE, { ref: { type: "note", id: 2, kbId: 3 }, locator: {} });
  const surface = useSidePanelStore.getState().surfaces[SURFACE];
  if (!surface) throw new Error("期望侧栏分区");
  return surface;
}

function renderBar(options: { maximized?: boolean; canMaximize?: boolean } = {}) {
  const surface = setup();
  const onToggleMaximized = vi.fn();
  const onCollapse = vi.fn();
  render(
    <TabBar
      surface={SURFACE}
      tabs={surface.tabs}
      activeId={surface.activeId}
      hints={surface.hints}
      canMaximize={options.canMaximize ?? true}
      maximized={options.maximized ?? false}
      onToggleMaximized={onToggleMaximized}
      onCollapse={onCollapse}
    />,
  );
  return { surface, onToggleMaximized, onCollapse };
}

beforeEach(() => {
  useSidePanelStore.setState({ surfaces: {}, guards: {}, newWindowHandlers: {} });
});

describe("侧栏标签条", () => {
  /** 标题来自定义 hook，关闭按钮带标题。 */
  it("渲染标题与关闭按钮", () => {
    const { surface } = renderBar();
    expect(screen.getByText("笔记 1")).toBeVisible();
    expect(screen.getByText("笔记 2")).toBeVisible();
    expect(screen.getByRole("button", { name: "关闭「笔记 1」" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("笔记 2");
    expect(surface.activeId).not.toBeNull();
  });

  /** 点击标签激活，中键关闭。 */
  it("点击激活与中键关闭", () => {
    renderBar();
    const first = useSidePanelStore.getState().surfaces[SURFACE]?.tabs[0]?.id as TabId;
    fireEvent.click(screen.getByText("笔记 1"));
    expect(useSidePanelStore.getState().surfaces[SURFACE]?.activeId).toBe(first);

    fireEvent(screen.getByText("笔记 1"), new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(useSidePanelStore.getState().surfaces[SURFACE]?.tabs).toHaveLength(1);
  });

  /** 方向键在标签间移动焦点，Enter 激活。 */
  it("键盘移动焦点并激活", () => {
    renderBar();
    const tabs = screen.getAllByRole("tab");
    tabs[0]?.focus();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[1]);

    fireEvent.keyDown(tabs[1] as HTMLElement, { key: "Enter" });
    expect(useSidePanelStore.getState().surfaces[SURFACE]?.activeId).toBe(
      useSidePanelStore.getState().surfaces[SURFACE]?.tabs[1]?.id,
    );
  });

  /** 关闭按钮只关自己，不触发激活。 */
  it("关闭按钮", () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "关闭「笔记 1」" }));
    expect(useSidePanelStore.getState().surfaces[SURFACE]?.tabs).toHaveLength(1);
  });

  /** 最大化 / 还原按钮按状态切换，规则 4 下不渲染。 */
  it("最大化按钮", () => {
    const { onToggleMaximized } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "最大化" }));
    expect(onToggleMaximized).toHaveBeenCalledOnce();
  });

  it("最大化时显示还原", () => {
    renderBar({ maximized: true });
    expect(screen.getByRole("button", { name: "还原" })).toBeInTheDocument();
  });

  it("不可最大化时不渲染按钮", () => {
    renderBar({ canMaximize: false });
    expect(screen.queryByRole("button", { name: "最大化" })).toBeNull();
    expect(screen.queryByRole("button", { name: "还原" })).toBeNull();
  });
});
