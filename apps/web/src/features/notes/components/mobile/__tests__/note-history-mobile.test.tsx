import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
const search = vi.hoisted(() => ({ current: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/m/notes/3/7/history",
  useSearchParams: () => new URLSearchParams(search.current),
}));

const history = vi.hoisted(() => ({
  infinite: vi.fn(),
  detail: vi.fn(),
  restore: { mutateAsync: vi.fn(), isPending: false },
}));
vi.mock("@/features/notes/use-note-history", () => ({
  useNoteHistoryInfinite: history.infinite,
  useNoteHistoryQuery: history.detail,
  useRestoreNoteVersionMutation: () => history.restore,
}));

vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({ value }: { value: string }) => <div data-testid="readonly-editor">{value}</div>,
}));

import { MobileNoteHistory } from "@/features/notes/components/mobile/note-history-mobile";
import { renderWithProviders } from "@/test/render";

const IDLE = { isPending: false, isError: false, isFetching: false };

const ROWS = [
  { operationLogId: 30, operationTime: "2026-09-16T11:05:00", updaterNickname: "陈可" },
  { operationLogId: 20, operationTime: "2026-09-16T09:00:00", updaterNickname: "林一" },
  { operationLogId: 10, operationTime: "2026-09-12T10:00:00", updaterNickname: "陈可" },
];

function mockInfinite(rows = ROWS, extra: Record<string, unknown> = {}) {
  history.infinite.mockReturnValue({
    ...IDLE,
    data: { pages: [{ rows, total: rows.length, pages: 1, page: 1 }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...extra,
  } as never);
}

function mockDetail(value: Record<string, unknown>) {
  history.detail.mockReturnValue({ ...IDLE, data: value } as never);
}

describe("MobileNoteHistory · 列表", () => {
  it("按日期分组，第一条是「当前版本」且不可点", () => {
    search.current = "";
    mockInfinite();
    mockDetail({
      title: "会议纪要",
      content: "# 会议纪要\n正文",
      historyTime: "2026-09-16T11:05:00",
    });
    renderWithProviders(<MobileNoteHistory baseId={3} noteId={7} />);

    expect(screen.getByTestId("history-current-30")).toBeInTheDocument();
    expect(screen.getByText("当前版本")).toBeInTheDocument();
    // 其余两条是可点的版本行
    expect(screen.getByTestId("history-version-20")).toBeInTheDocument();
    expect(screen.getByTestId("history-version-10")).toBeInTheDocument();
  });

  it("点版本行用 push 进版本页（?v=），返回键能回列表", () => {
    search.current = "";
    mockInfinite();
    mockDetail({ title: "t", content: "c", historyTime: "2026-09-16T09:00:00" });
    renderWithProviders(<MobileNoteHistory baseId={3} noteId={7} />);

    fireEvent.click(screen.getByTestId("history-version-20"));
    expect(router.push).toHaveBeenCalledWith("/m/notes/3/7/history?v=20");
  });

  it("没有历史版本时给出空态", () => {
    search.current = "";
    mockInfinite([]);
    mockDetail({ title: "t", content: "", historyTime: null });
    renderWithProviders(<MobileNoteHistory baseId={3} noteId={7} />);

    expect(screen.getByText("这篇笔记还没有历史版本")).toBeInTheDocument();
    expect(screen.getByText("之后每次保存都会在这里留下一个版本。")).toBeInTheDocument();
  });

  it("滚到底自动取下一页（每页 15 条由 hook 决定）", () => {
    search.current = "";
    const fetchNextPage = vi.fn();
    mockInfinite(ROWS, { hasNextPage: true, fetchNextPage });
    mockDetail({ title: "t", content: "c", historyTime: null });

    // jsdom 没有 IntersectionObserver：给一个立刻回调的假实现
    const observe = vi.fn((_: unknown, callback?: unknown) => undefined);
    class FakeObserver {
      constructor(private callback: IntersectionObserverCallback) {}
      observe = (node: Element) => observe(node, this.callback);
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = () => [];
      root = null;
      rootMargin = "";
      thresholds = [];
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver as never);

    renderWithProviders(<MobileNoteHistory baseId={3} noteId={7} />);
    // 触发一次"进入视口"
    const instance = observe.mock.instances[0] as unknown as {
      callback: IntersectionObserverCallback;
    };
    if (instance?.callback) {
      act(() => {
        instance.callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          instance as unknown as IntersectionObserver,
        );
      });
      expect(fetchNextPage).toHaveBeenCalled();
    }
    vi.unstubAllGlobals();
  });
});

describe("MobileNoteHistory · 版本页（?v=）", () => {
  it("顶栏标题是版本时间，「正文 / 本次改动」分段", () => {
    search.current = "v=20";
    mockInfinite();
    mockDetail({
      title: "会议纪要",
      content: "# 会议纪要\n正文",
      historyTime: "2026-09-16T09:00:00",
    });
    renderWithProviders(<MobileNoteHistory baseId={3} noteId={7} />);

    expect(screen.getByTestId("mobile-note-history-version")).toBeInTheDocument();
    // 列表态不再渲染
    expect(screen.queryByTestId("history-list")).toBeNull();
    // 顶栏标题 = 版本时间（今天 09:00）
    expect(screen.getByRole("heading", { name: /09:00/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "正文" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "本次改动" })).toBeInTheDocument();
  });

  it("版本页的返回是回列表（同一路由，不是浏览器上一页）", () => {
    search.current = "v=20";
    mockInfinite();
    mockDetail({ title: "t", content: "c", historyTime: "2026-09-16T09:00:00" });
    renderWithProviders(<MobileNoteHistory baseId={3} noteId={7} />);

    fireEvent.click(screen.getByTestId("mobile-back"));
    expect(router.push).toHaveBeenCalledWith("/m/notes/3/7/history");
  });

  it("切到「本次改动」渲染行级差异视图", () => {
    search.current = "v=10";
    mockInfinite();
    // 20 是比 10 更早的一版？不是——列表倒序，10 之后没有更早的了
    mockDetail({ title: "t", content: "旧正文", historyTime: "2026-09-12T10:00:00" });
    renderWithProviders(<MobileNoteHistory baseId={3} noteId={7} />);

    fireEvent.click(screen.getByRole("radio", { name: "本次改动" }));
    expect(screen.getByTestId("history-diff-view")).toBeInTheDocument();
  });

  it("恢复必须连点两次（动作表二次确认）", async () => {
    search.current = "v=20";
    const mutateAsync = vi.fn(async () => ({ status: "restored" }));
    history.restore.mutateAsync = mutateAsync;
    mockInfinite();
    mockDetail({ title: "t", content: "c", historyTime: "2026-09-16T09:00:00" });
    renderWithProviders(<MobileNoteHistory baseId={3} noteId={7} />);

    fireEvent.click(screen.getByTestId("history-restore"));
    fireEvent.click(screen.getByRole("button", { name: "恢复" }));
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "再点一次确认恢复" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    // 成功后回编辑页（replace，历史这一步没有回退的意义）
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/m/notes/3/7"));
  });

  it("当前版本不可恢复（按钮禁用）", () => {
    search.current = "v=30";
    mockInfinite();
    mockDetail({ title: "t", content: "c", historyTime: "2026-09-16T11:05:00" });
    renderWithProviders(<MobileNoteHistory baseId={3} noteId={7} />);

    expect(screen.getByTestId("history-restore")).toBeDisabled();
  });
});
