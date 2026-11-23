import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth/use-me", () => ({ useMe: () => ({ data: undefined }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/features/notes/use-note", () => ({
  useNoteQuery: () => ({ data: { title: "笔记" }, error: null }),
}));
vi.mock("@/features/side-panel/tab-panel", () => ({ TabPanel: () => null }));

import { SidePanelMobileHost } from "@/features/side-panel/mobile/host";
import { emptySurface, useSidePanelStore } from "@/features/side-panel/store";
import { asTabId } from "@/features/side-panel/types";

/**
 * 移动端覆盖层测试。
 *
 * @author 称霸幼儿园
 */
beforeEach(() => {
  vi.restoreAllMocks();
  push.mockClear();
  useSidePanelStore.setState({ surfaces: {}, guards: {}, newWindowHandlers: {} });
  window.history.replaceState(null, "");
});

describe("移动端侧栏覆盖层", () => {
  /** 关闭按钮优先回退自己压入的历史记录。 */
  it("关闭按钮回退历史记录", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(
      <SidePanelMobileHost
        surface="chat:c1"
        pending={null}
        panelOpen
        onPanelOpenChange={vi.fn()}
        onTabCountChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("side-panel-mobile")).toBeVisible();
    expect(screen.getByText("右侧栏")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(back).toHaveBeenCalledOnce();
  });

  /** 焦点在标签头时 Esc 收起，焦点在正文时不处理。 */
  it("Esc 只在标签头生效", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(
      <SidePanelMobileHost
        surface="chat:c1"
        pending={null}
        panelOpen
        onPanelOpenChange={vi.fn()}
        onTabCountChange={vi.fn()}
      />,
    );
    const overlay = screen.getByTestId("side-panel-mobile");
    const header = overlay.querySelector("header");
    if (!header) throw new Error("期望标签头");
    fireEvent.keyDown(header, { key: "Escape" });
    expect(back).toHaveBeenCalledOnce();

    back.mockClear();
    fireEvent.keyDown(screen.getByText("点击回答里的引用，在这里查看和编辑"), {
      key: "Escape",
    });
    expect(back).not.toHaveBeenCalled();
  });

  /** 返回手势被守卫拒绝时保持覆盖层，并补回被 pop 掉的历史标记。 */
  it("返回被守卫拒绝时保持覆盖层", async () => {
    const onChange = renderOpenOverlay();
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(true));
    onChange.mockClear();
    act(() => useSidePanelStore.setState({ guards: { "chat:c1": () => false } }));
    const push = vi.spyOn(window.history, "pushState");

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(useSidePanelStore.getState().surfaces["chat:c1"]?.open).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ __anynoteSidePanel: true }), "");
  });

  /** 返回手势在守卫允许时关闭覆盖层。 */
  it("返回在守卫允许时关闭覆盖层", async () => {
    const onChange = renderOpenOverlay();
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(true));
    onChange.mockClear();
    act(() => useSidePanelStore.setState({ guards: { "chat:c1": () => true } }));

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(useSidePanelStore.getState().surfaces["chat:c1"]?.open).toBe(false);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  /** 打开完整页面先走当前正文的离开守卫，取消时不导航。 */
  it("打开完整页面受离开守卫约束", async () => {
    renderOpenOverlay();
    expect(await screen.findByRole("heading", { name: "笔记" })).toBeVisible();

    act(() => useSidePanelStore.setState({ guards: { "chat:c1": () => false } }));
    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "打开完整页面" }));
    expect(push).not.toHaveBeenCalled();

    act(() => useSidePanelStore.setState({ guards: { "chat:c1": () => true } }));
    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "打开完整页面" }));
    expect(push).toHaveBeenCalledWith("/m/notes/3/5");
  });
});

/** 渲染一个带活动笔记标签的展开覆盖层。 */
function renderOpenOverlay() {
  const onChange = vi.fn();
  render(
    <SidePanelMobileHost
      surface="chat:c1"
      pending={null}
      panelOpen
      onPanelOpenChange={onChange}
      onTabCountChange={vi.fn()}
    />,
  );
  const surface = emptySurface();
  surface.open = true;
  surface.tabs = [
    {
      id: asTabId("t1"),
      kind: "note",
      family: "resource",
      ref: { type: "note", id: 5, kbId: 3 },
    },
  ];
  surface.activeId = asTabId("t1");
  surface.recent = [asTabId("t1")];
  surface.seq = 1;
  act(() => {
    useSidePanelStore.setState({
      surfaces: { "chat:c1": surface },
      guards: {},
      newWindowHandlers: {},
    });
  });
  return onChange;
}
