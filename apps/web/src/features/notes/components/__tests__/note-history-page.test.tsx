import { noteApi } from "@/lib/api/openapi";
import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoteHistoryPage } from "../note-history-page";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { PATCH: vi.fn(), GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

/** 只读 TipTap 是重依赖（动态加载），测试里换成能显示正文的桩件。 */
vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({ value }: { value: string }) => (
    <div data-testid="readonly-editor">{value}</div>
  ),
}));

const get = noteApi.GET as unknown as Mock;
const patch = noteApi.PATCH as unknown as Mock;

const BASE_ID = 7;
const NOTE_ID = 42;

const NOW_ISO = new Date().toISOString();
const YESTERDAY_ISO = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

function envelope(data: unknown, code = "00000") {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  };
}

function historyRow(id: number, time: string, nickname: string) {
  return { operationLogId: id, operationTime: time, updaterNickname: nickname };
}

/** 三个版本：当前 / 上一个 / 更早，覆盖「默认选中第二条」。 */
function defaultGet(options?: { permissions?: number; versions?: number }) {
  const permissions = options?.permissions ?? 2;
  const versionCount = options?.versions ?? 3;
  const rows = Array.from({ length: versionCount }, (_, index) =>
    historyRow(
      900 + index,
      index === 0 ? NOW_ISO : index === 1 ? YESTERDAY_ISO : "2026-01-05T01:00:00.000Z",
      `作者${index}`,
    ),
  );

  return (path: string, init: { params?: { query?: { operationId?: number } } }) => {
    if (path === "/notes/historyList") {
      return Promise.resolve(
        envelope({ current: 1, pages: 1, total: rows.length, rows }),
      );
    }
    if (path === "/notes/history") {
      const id = init.params?.query?.operationId ?? 0;
      return Promise.resolve(
        envelope({
          noteHistoryId: id,
          noteId: NOTE_ID,
          title: `版本 ${id}`,
          content: `# 版本 ${id}\n\n第 ${id} 版正文`,
          historyTime: NOW_ISO,
        }),
      );
    }
    if (path === "/bases/{id}") {
      return Promise.resolve(
        envelope({ id: BASE_ID, knowledgeBaseName: "测试库", permissions }),
      );
    }
    if (path === "/notes/{noteId}") {
      // 恢复的第 1 步：拿服务端当前版本号
      return Promise.resolve(envelope({ id: NOTE_ID, updateTime: NOW_ISO }));
    }
    return Promise.resolve(envelope(null));
  };
}

beforeEach(() => {
  get.mockReset();
  patch.mockReset();
  router.push.mockReset();
  router.replace.mockReset();
  get.mockImplementation(defaultGet());
});

describe("NoteHistoryPage 布局与默认选中", () => {
  it("默认选中第二条（上一个版本），不是当前版本", async () => {
    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);

    // 当前版本是 900，上一个版本是 901
    await waitFor(() =>
      expect(screen.getByTestId("history-row-901")).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByTestId("history-row-900")).toHaveAttribute("aria-pressed", "false");
    // 左栏加载的是被选中那一版的内容
    await waitFor(() => expect(screen.getByTestId("readonly-editor")).toHaveTextContent("版本 901"));
    expect(get).toHaveBeenCalledWith("/notes/history", {
      params: { query: { operationId: 901 } },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
  });

  it("面板标题报「共 N 个版本」，并按日期分组", async () => {
    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);

    await waitFor(() => expect(screen.getByTestId("history-row-901")).toBeInTheDocument());
    expect(screen.getByTestId("history-total")).toHaveTextContent("共 3 个版本");
    // 今天 / 昨天各一条，更早那条按日历日
    expect(screen.getByText("今天")).toBeInTheDocument();
    expect(screen.getByText("昨天")).toBeInTheDocument();
  });

  it("提示条说明正在看谁的哪一版，与编辑器区分", async () => {
    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);

    await waitFor(() => expect(screen.getByTestId("history-viewing")).toBeInTheDocument());
    expect(screen.getByTestId("history-viewing")).toHaveTextContent(/正在查看 作者1 于 .* 保存的版本/);
  });

  it("第一条带「当前版本」徽标", async () => {
    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);

    await waitFor(() => expect(screen.getByTestId("history-current-900")).toBeInTheDocument());
    expect(screen.queryByTestId("history-current-901")).toBeNull();
  });

  it("点击其他版本切换左栏内容，不发新的列表请求", async () => {
    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(screen.getByTestId("history-row-902")).toBeInTheDocument());

    const listCallsBefore = get.mock.calls.filter((call) => call[0] === "/notes/historyList").length;
    fireEvent.click(screen.getByTestId("history-row-902"));

    await waitFor(() => expect(screen.getByTestId("readonly-editor")).toHaveTextContent("版本 902"));
    expect(screen.getByTestId("history-row-902")).toHaveAttribute("aria-pressed", "true");
    const listCallsAfter = get.mock.calls.filter((call) => call[0] === "/notes/historyList").length;
    expect(listCallsAfter).toBe(listCallsBefore);
  });
});

describe("NoteHistoryPage 恢复按钮的可见性", () => {
  it("选中「当前版本」时隐藏恢复", async () => {
    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(screen.getByTestId("history-restore")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("history-row-900"));

    await waitFor(() => expect(screen.queryByTestId("history-restore")).toBeNull());
  });

  it("本库权限 3（可阅读）时隐藏恢复", async () => {
    get.mockImplementation(defaultGet({ permissions: 3 }));
    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);

    await waitFor(() => expect(screen.getByTestId("history-row-901")).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByTestId("history-restore")).toBeNull());
  });

  it("本库权限 2（可编辑）时显示恢复", async () => {
    get.mockImplementation(defaultGet({ permissions: 2 }));
    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);

    await waitFor(() => expect(screen.getByTestId("history-restore")).toBeInTheDocument());
  });
});

describe("NoteHistoryPage 只有一个版本", () => {
  it("选中那一条并显示空态，不给恢复入口", async () => {
    get.mockImplementation(defaultGet({ versions: 1 }));
    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);

    await waitFor(() => expect(screen.getByTestId("history-empty")).toBeInTheDocument());
    expect(screen.getByText("这篇笔记还没有历史版本")).toBeInTheDocument();
    expect(
      screen.getByText("之后每次保存都会在这里留下一个版本。"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("history-restore")).toBeNull();
    // 唯一那条仍然是选中的（列表里标成当前版本）
    expect(screen.getByTestId("history-row-900")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("NoteHistoryPage 本次改动的增删行样式", () => {
  function diffGet() {
    return (path: string, init: { params?: { query?: { operationId?: number } } }) => {
      if (path === "/notes/historyList") {
        return Promise.resolve(
          envelope({
            current: 1,
            pages: 1,
            total: 2,
            rows: [historyRow(900, NOW_ISO, "作者0"), historyRow(901, YESTERDAY_ISO, "作者1")],
          }),
        );
      }
      if (path === "/notes/history") {
        const id = init.params?.query?.operationId ?? 0;
        // 901 是更早那一版（比较基线），900 是当前版本
        return Promise.resolve(
          envelope({
            noteHistoryId: id,
            title: "标题",
            content: id === 900 ? "# 标题\n\n保留行\n新增行" : "# 标题\n\n保留行\n删除行",
            historyTime: NOW_ISO,
          }),
        );
      }
      if (path === "/bases/{id}") {
        return Promise.resolve(envelope({ id: BASE_ID, knowledgeBaseName: "测试库", permissions: 2 }));
      }
      return Promise.resolve(envelope(null));
    };
  }

  it("新增行带下划线、删除行带删除线，颜色之外还有形状", async () => {
    get.mockImplementation(diffGet());
    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(screen.getByTestId("history-row-900")).toBeInTheDocument());

    // 切到「本次改动」不发请求，两份内容都已在手。
    // 默认选中 901（上一个版本），它的"上一版本"是 900——即更新的那一版，
    // 所以先点回 900（当前版本），再切分段，比较方向才是 901 → 900。
    fireEvent.click(screen.getByTestId("history-row-900"));
    fireEvent.click(screen.getByRole("radio", { name: "本次改动" }));

    await waitFor(() => expect(screen.getByTestId("history-diff-view")).toBeInTheDocument());

    const lines = screen.getByTestId("history-diff-lines");
    const added = lines.querySelector('[data-op="added"]');
    const removed = lines.querySelector('[data-op="removed"]');
    expect(added).not.toBeNull();
    expect(removed).not.toBeNull();

    // 新增 = success 18% 底 + 下划线
    expect(added?.className).toContain("bg-success/18");
    expect(added?.className).toContain("underline");
    expect(added?.className).toContain("decoration-success");
    // 删除 = danger 12% 底 + 删除线
    expect(removed?.className).toContain("bg-danger/12");
    expect(removed?.className).toContain("line-through");
    expect(removed?.textContent).toContain("删除行");
  });
});

describe("NoteHistoryPage 版本加载失败", () => {
  it("显示「这个版本加载失败」并可重试", async () => {
    let attempt = 0;
    get.mockImplementation((path: string, init: { params?: { query?: { operationId?: number } } }) => {
      if (path === "/notes/historyList") {
        return Promise.resolve(
          envelope({
            current: 1,
            pages: 1,
            total: 2,
            rows: [historyRow(900, NOW_ISO, "作者0"), historyRow(901, YESTERDAY_ISO, "作者1")],
          }),
        );
      }
      if (path === "/notes/history") {
        attempt += 1;
        // 第一次失败，重试成功
        if (attempt === 1) {
          return Promise.resolve({
            response: new Response(JSON.stringify({ code: "B0001", msg: "版本不存在" }), {
              status: 200,
            }),
          });
        }
        return Promise.resolve(
          envelope({ noteHistoryId: 901, title: "重试后的标题", content: "# 重试后的正文" }),
        );
      }
      if (path === "/bases/{id}") {
        return Promise.resolve(envelope({ id: BASE_ID, knowledgeBaseName: "测试库", permissions: 2 }));
      }
      return Promise.resolve(envelope(null));
    });

    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("这个版本加载失败"));
    // 列表不受影响：右边仍然列着版本
    expect(screen.getByTestId("history-row-901")).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "重试" }));

    await waitFor(() =>
      expect(screen.getByTestId("readonly-editor")).toHaveTextContent("重试后的正文"),
    );
  });

  it("历史列表加载失败显示可重试的错误态", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/notes/historyList") {
        return Promise.resolve({
          response: new Response(JSON.stringify({ code: "B0001", msg: "查询失败" }), {
            status: 200,
          }),
        });
      }
      if (path === "/bases/{id}") {
        return Promise.resolve(envelope({ id: BASE_ID, knowledgeBaseName: "测试库", permissions: 2 }));
      }
      return Promise.resolve(envelope(null));
    });

    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);

    await waitFor(() =>
      expect(screen.getByTestId("history-panel")).toHaveTextContent("历史版本加载失败"),
    );
    expect(
      within(screen.getByTestId("history-panel")).getByRole("button", { name: "重试" }),
    ).toBeInTheDocument();
  });
});

describe("NoteHistoryPage 恢复流程", () => {
  it("点击「恢复此版本」弹确认，说明用图例原文", async () => {
    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(screen.getByTestId("history-restore")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("history-restore"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("恢复到这个版本？")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("当前内容会先作为一个新版本保留在历史记录里，随时可以再换回来。");
    // 默认焦点在取消，回车不会直接生效
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus());
  });

  it("确认后按顺序 GET 版本号再 PATCH 写回，toast 后回编辑器", async () => {
    get.mockImplementation(defaultGet());
    patch.mockResolvedValue(envelope({ id: NOTE_ID, title: "版本 901", content: "# 版本 901" }));

    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(screen.getByTestId("history-restore")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("history-restore"));
    fireEvent.click(await screen.findByRole("button", { name: "恢复" }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0]?.[1].body).toMatchObject({
      title: "版本 901",
      content: "# 版本 901\n\n第 901 版正文",
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/notes/${BASE_ID}/${NOTE_ID}`));
  });

  it("冲突时留在本页并提示刷新", async () => {
    get.mockImplementation(defaultGet());
    patch.mockResolvedValue(envelope(null, "A0409"));

    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(screen.getByTestId("history-restore")).toBeInTheDocument());
    const initialListCalls = get.mock.calls.filter(
      (call) => call[0] === "/notes/historyList",
    ).length;

    fireEvent.click(screen.getByTestId("history-restore"));
    fireEvent.click(await screen.findByRole("button", { name: "恢复" }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByTestId("note-history-page")).toBeInTheDocument();
    // 冲突后立刻重取列表，否则用户对着旧列表继续点恢复
    await waitFor(() =>
      expect(
        get.mock.calls.filter((call) => call[0] === "/notes/historyList").length,
      ).toBeGreaterThan(initialListCalls),
    );
  });
});

describe("NoteHistoryPage 返回与满幅", () => {
  it("返回笔记是链接语义，指向编辑器地址", async () => {
    renderWithProviders(<NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />);

    const back = screen.getByTestId("history-back");
    // 用 <a> 而不是 button：本页唯一的出路要支持新窗口打开与复制地址
    expect(back.tagName).toBe("A");
    expect(back).toHaveAttribute("href", `/notes/${BASE_ID}/${NOTE_ID}`);
  });

  it("整页不画卡片：吃满剩余高度，左右两栏各自满幅", async () => {
    const { container } = renderWithProviders(
      <NoteHistoryPage baseId={BASE_ID} noteId={NOTE_ID} />,
    );
    await waitFor(() => expect(screen.getByTestId("history-panel")).toBeInTheDocument());

    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain("flex-1");
    expect(shell.className).toContain("min-h-0");
    expect(shell.className).not.toMatch(/rounded|shadow/);
    // 右栏固定 320（w-80）
    expect(screen.getByTestId("history-panel").className).toContain("w-80");
  });
});
