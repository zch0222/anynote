import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/use-me", () => ({ useMe: () => ({ data: undefined }) }));
vi.mock("@/features/notes/use-note", () => ({
  useNoteQuery: () => ({ data: { title: "复习笔记" }, error: null }),
}));
vi.mock("@/features/side-panel/tabs/note/body", () => ({
  NoteTabBody: () => (
    <div data-testid="note-body">
      <header data-side-panel-header>
        <h2>复习笔记</h2>
      </header>
    </div>
  ),
}));

import {
  SidePanelExpandButton,
  SidePanelHost,
  SidePanelProvider,
  useSidePanelShell,
} from "@/features/side-panel/launcher";
import { useSidePanelLink } from "@/features/side-panel/link-context";
import { SIDE_PANEL_OPEN_KEY } from "@/features/side-panel/storage-keys";
import { useSidePanelStore } from "@/features/side-panel/store";
import { renderWithProviders } from "@/test/render";

/**
 * 首屏入口与桌面宿主测试。
 *
 * @author 称霸幼儿园
 */
function Harness() {
  const shell = useSidePanelShell();
  return (
    <>
      {!shell?.panelOpen ? <SidePanelExpandButton /> : null}
      {shell?.mounted ? (
        <SidePanelHost
          surface="chat:c1"
          pending={shell.pending}
          panelOpen={shell.panelOpen}
          onPanelOpenChange={shell.setPanelOpen}
          onListVisibleChange={() => {}}
        />
      ) : null}
    </>
  );
}

function OpenNote({ focus = false }: { focus?: boolean }) {
  const open = useSidePanelLink();
  return (
    <button
      type="button"
      onClick={() =>
        open?.(
          {
            kind: "citation",
            citation: {
              sourceId: "note:5",
              kbId: 3,
              locator: { sectionPath: "第一章" },
              title: "复习笔记",
              kbName: "复习库",
            },
          },
          { focus },
        )
      }
    >
      打开笔记
    </button>
  );
}

beforeEach(() => {
  useSidePanelStore.setState({ surfaces: {}, guards: {}, newWindowHandlers: {} });
  localStorage.clear();
});

/** 写入刷新前展开的标记。 */
function storeOpenFlag() {
  localStorage.setItem(SIDE_PANEL_OPEN_KEY, "1");
}

/** 等待懒加载的桌面宿主挂载；全量并行跑测试时给足加载时间。 */
function findPanel() {
  return screen.findByTestId("side-panel", {}, { timeout: 5_000 });
}

describe("侧栏入口与桌面宿主", () => {
  /** 展开按钮只在收起时出现；展开后显示空态，收起后按钮回来。 */
  it("展开与收起", async () => {
    renderWithProviders(
      <SidePanelProvider>
        <Harness />
      </SidePanelProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开右侧栏" }));
    expect(await findPanel()).toBeVisible();
    expect(screen.getByText("点击回答里的引用，在这里查看和编辑")).toBeVisible();
    expect(screen.queryByRole("button", { name: "展开右侧栏" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "收起右侧栏" }));
    await waitFor(() => expect(screen.queryByTestId("side-panel")).toBeNull());
    expect(screen.getByRole("button", { name: "展开右侧栏" })).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "展开右侧栏" })).toHaveFocus());
  });

  /** 覆盖呈现下，Esc 只在标签条与标签头生效。 */
  it("覆盖态 Esc 的生效范围", async () => {
    renderWithProviders(
      <SidePanelProvider>
        <Harness />
        <OpenNote />
      </SidePanelProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "打开笔记" }));
    await findPanel();

    fireEvent.keyDown(screen.getByRole("tabpanel"), { key: "Escape" });
    expect(screen.getByTestId("side-panel")).toBeVisible();

    const heading = await screen.findByRole("heading", { name: "复习笔记" });
    fireEvent.keyDown(heading, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("side-panel")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "展开右侧栏" }));
    await findPanel();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("side-panel")).toBeNull());
  });

  /** 引用点击打开标签，播报标题，键盘触发把焦点移进正文。 */
  it("打开资源并播报", async () => {
    renderWithProviders(
      <SidePanelProvider>
        <Harness />
        <OpenNote focus />
      </SidePanelProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开笔记" }));
    expect(await findPanel()).toBeVisible();
    await waitFor(() =>
      expect(screen.getByTestId("side-panel-announcer")).toHaveTextContent(
        "已在右侧栏打开「复习笔记」",
      ),
    );
    expect(useSidePanelStore.getState().surfaces["chat:c1"]?.tabs).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toHaveAttribute("role", "tabpanel"));
  });

  /** 已有标签时再次打开同一资源只推进导航版本。 */
  it("再次打开同一资源不新增标签", async () => {
    renderWithProviders(
      <SidePanelProvider>
        <Harness />
        <OpenNote />
      </SidePanelProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "打开笔记" }));
    await findPanel();
    fireEvent.click(screen.getByRole("button", { name: "打开笔记" }));
    await waitFor(() =>
      expect(useSidePanelStore.getState().surfaces["chat:c1"]?.tabs).toHaveLength(1),
    );
    const surface = useSidePanelStore.getState().surfaces["chat:c1"];
    expect(surface?.navigation[surface.activeId ?? ""]?.revision).toBe(2);
  });

  /** 刷新前展开的分区在用户 id 就绪后恢复展开。 */
  it("恢复刷新前的展开状态", async () => {
    storeOpenFlag();
    renderWithProviders(
      <SidePanelProvider>
        <Harness />
      </SidePanelProvider>,
    );
    expect(await findPanel()).toBeVisible();
  });

  /** 移动端忽略持久化的展开状态。 */
  it("restoreOpen 为假时不自动展开", async () => {
    storeOpenFlag();
    renderWithProviders(
      <SidePanelProvider restoreOpen={false}>
        <Harness />
      </SidePanelProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId("side-panel")).toBeNull());
    expect(screen.getByRole("button", { name: "展开右侧栏" })).toBeVisible();
  });
});
