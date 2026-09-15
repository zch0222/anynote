import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
  Toaster: () => null,
}));

const useMe = vi.fn();
vi.mock("@/features/auth/use-me", () => ({
  useMe: () => useMe(),
}));

const useKnowledgeBaseQuery = vi.fn();
const useKnowledgeBaseMembersQuery = vi.fn();
const mutateAsync = vi.fn();
vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBaseQuery: (...args: unknown[]) => useKnowledgeBaseQuery(...args),
  useKnowledgeBaseMembersQuery: (...args: unknown[]) => useKnowledgeBaseMembersQuery(...args),
  useRemoveMemberMutation: () => ({ mutateAsync, isPending: false }),
}));

import { KnowledgeBaseMembers } from "../knowledge-base-members";

const IDLE = { isPending: false, isError: false, isFetching: false };

const MEMBERS = [
  { userId: 1, username: "linyi", nickname: "林一", permissions: 1 },
  { userId: 2, username: "zhouning", nickname: "周宁", permissions: 3 },
];

function mockBase(permissions: number) {
  useKnowledgeBaseQuery.mockReturnValue({ ...IDLE, data: { id: 7, permissions } } as never);
}

function mockMembers(rows: unknown[]) {
  useKnowledgeBaseMembersQuery.mockReturnValue({ ...IDLE, data: { rows, total: rows.length } });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  useMe.mockReturnValue({ data: { id: 1, username: "linyi" }, ...IDLE });
  mockBase(1);
  mockMembers(MEMBERS);
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue(undefined);
  toastSuccess.mockReset();
  toastError.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("KnowledgeBaseMembers（D-09）", () => {
  it("展示三档权限说明卡", () => {
    renderWithProviders(<KnowledgeBaseMembers baseId={7} />);

    const guide = screen.getByTestId("permission-guide");
    expect(guide).toHaveTextContent("管理员");
    expect(guide).toHaveTextContent("可编辑");
    expect(guide).toHaveTextContent("可阅读");
  });

  it("搜索防抖 300ms：期间不发请求，静默后才带上 username", async () => {
    renderWithProviders(<KnowledgeBaseMembers baseId={7} />);
    expect(useKnowledgeBaseMembersQuery).toHaveBeenLastCalledWith(7, { username: "" });

    fireEvent.change(screen.getByTestId("member-search"), { target: { value: "zhou" } });
    // 防抖窗口内仍然是旧关键词
    expect(useKnowledgeBaseMembersQuery).toHaveBeenLastCalledWith(7, { username: "" });

    await vi.advanceTimersByTimeAsync(299);
    expect(useKnowledgeBaseMembersQuery).toHaveBeenLastCalledWith(7, { username: "" });

    await vi.advanceTimersByTimeAsync(1);
    await waitFor(() =>
      expect(useKnowledgeBaseMembersQuery).toHaveBeenLastCalledWith(7, { username: "zhou" }),
    );
  });

  it("搜索无结果时按关键词提示，并可一键清除搜索", async () => {
    renderWithProviders(<KnowledgeBaseMembers baseId={7} />);

    fireEvent.change(screen.getByTestId("member-search"), { target: { value: "nobody" } });
    mockMembers([]);
    await vi.advanceTimersByTimeAsync(300);

    expect(await screen.findByText("没有找到用户名包含「nobody」的成员")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "清除搜索" }));
    expect(screen.getByTestId("member-search")).toHaveValue("");
  });

  it("非管理员（可编辑）看不到行操作菜单", () => {
    mockBase(2);
    renderWithProviders(<KnowledgeBaseMembers baseId={7} />);

    expect(screen.queryByTestId("member-actions-2")).toBeNull();
    expect(screen.queryByTestId("member-actions-1")).toBeNull();
  });

  it("管理员能移除他人，但自己那行没有菜单", async () => {
    renderWithProviders(<KnowledgeBaseMembers baseId={7} />);

    // 自己（userId 1）没有菜单，别人（userId 2）有
    expect(screen.queryByTestId("member-actions-1")).toBeNull();
    fireEvent.click(screen.getByTestId("member-actions-2"));
    fireEvent.click(await screen.findByText("移除成员"));

    // 先出确认框，此时还没发请求
    expect(await screen.findByText("移除成员？")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "移除" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ userId: 2, knowledgeBaseId: 7 }),
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("成员已移除"));
  });

  it("加载失败显示 QueryError 并可重试", async () => {
    useKnowledgeBaseMembersQuery.mockReturnValue({
      isPending: false,
      isError: true,
      isFetching: false,
      error: new Error("boom"),
    });
    renderWithProviders(<KnowledgeBaseMembers baseId={7} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("成员加载失败：");
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
});
