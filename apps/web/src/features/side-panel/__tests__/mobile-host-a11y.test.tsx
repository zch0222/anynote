import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/use-me", () => ({ useMe: () => ({ data: undefined }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/notes/use-note", () => ({
  useNoteQuery: () => ({ data: { title: "笔记" }, error: null }),
}));
vi.mock("@/features/side-panel/tabs/note/body", () => ({
  NoteTabBody: () => <div>正文</div>,
}));

import { SidePanelMobileHost } from "@/features/side-panel/mobile/host";
import { emptySurface, useSidePanelStore } from "@/features/side-panel/store";
import { asTabId } from "@/features/side-panel/types";

/**
 * 移动端覆盖层的可访问名称测试。
 *
 * @author 称霸幼儿园
 */
beforeEach(() => {
  useSidePanelStore.setState({ surfaces: {}, guards: {}, newWindowHandlers: {} });
  window.history.replaceState(null, "");
});

describe("移动端侧栏可访问名称", () => {
  /** 正文面板的 aria-labelledby 指向当前标题元素。 */
  it("tabpanel 指向存在的标题", async () => {
    render(
      <SidePanelMobileHost
        surface="chat:c1"
        pending={null}
        panelOpen
        onPanelOpenChange={vi.fn()}
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

    const panel = await screen.findByRole("tabpanel");
    const labelledBy = panel.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const label = document.getElementById(labelledBy ?? "");
    expect(label?.tagName).toBe("H2");
    expect(label?.textContent).toBe("笔记");
  });
});
