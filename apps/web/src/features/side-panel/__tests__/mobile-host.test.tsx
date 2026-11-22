import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/use-me", () => ({ useMe: () => ({ data: undefined }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { SidePanelMobileHost } from "@/features/side-panel/mobile/host";
import { useSidePanelStore } from "@/features/side-panel/store";

/**
 * 移动端覆盖层测试。
 *
 * @author 称霸幼儿园
 */
beforeEach(() => {
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
});
