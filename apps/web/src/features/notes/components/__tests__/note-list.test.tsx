import { noteApi } from "@/lib/api/openapi";
import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoteList } from "../note-list";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { PATCH: vi.fn(), GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/notes/7",
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
  Toaster: () => null,
}));

const get = noteApi.GET as unknown as Mock;
const patch = noteApi.PATCH as unknown as Mock;
const remove = noteApi.DELETE as unknown as Mock;
const post = noteApi.POST as unknown as Mock;

function envelope(data: unknown, code = "00000") {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  };
}

const BASES = [
  { id: 7, knowledgeBaseName: "产品设计" },
  { id: 8, knowledgeBaseName: "工程文档" },
  { id: 9, knowledgeBaseName: "会议记录" },
];

/** 按 URL 分发，避免用调用顺序耦合用例（hook 的请求顺序会随实现变动）。 */
function routeGet(url: string) {
  if (url === "/notes") {
    return envelope({
      current: 1,
      pages: 1,
      total: 1,
      rows: [{ id: 42, title: "重构方案", updateTime: "2026-09-15T00:00:00.000Z" }],
    });
  }
  if (url === "/bases") {
    return envelope({ rows: BASES });
  }
  if (url === "/bases/{id}") {
    return envelope(BASES[0]);
  }
  throw new Error(`未打桩的 GET ${url}`);
}

beforeEach(() => {
  get.mockReset();
  patch.mockReset();
  remove.mockReset();
  post.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  get.mockImplementation((url: string) => Promise.resolve(routeGet(url)));
  patch.mockResolvedValue(envelope({ id: 42, version: "1000" }));
  remove.mockResolvedValue(envelope(null));
});

describe("NoteList（D-01）", () => {
  it("行操作菜单「移动到知识库」只列当前库以外的知识库", async () => {
    renderWithProviders(<NoteList baseId={7} />);

    fireEvent.click(await screen.findByTestId("note-actions-42"));

    expect(await screen.findByText("工程文档")).toBeInTheDocument();
    expect(screen.getByText("会议记录")).toBeInTheDocument();
    // 当前库（产品设计）是页头面包屑里的名字，但不该出现在移动目标里
    expect(screen.queryByRole("menuitem", { name: "产品设计" })).toBeNull();
  });

  it("移动到其他库：调 PATCH 并提示目标库名", async () => {
    renderWithProviders(<NoteList baseId={7} />);

    fireEvent.click(await screen.findByTestId("note-actions-42"));
    fireEvent.click(await screen.findByText("工程文档"));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0]?.[0]).toBe("/notes/{noteId}");
    expect(patch.mock.calls[0]?.[1].params).toEqual({ path: { noteId: 42 } });
    expect(patch.mock.calls[0]?.[1].body).toEqual({ knowledgeBaseId: 8 });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("已移动到 工程文档"));
  });

  it("删除笔记走 ConfirmDialog，确认后才调 DELETE", async () => {
    renderWithProviders(<NoteList baseId={7} />);

    fireEvent.click(await screen.findByTestId("note-actions-42"));
    fireEvent.click(await screen.findByText("删除笔记"));

    // 确认框先出现，此时还没发请求
    expect(await screen.findByText("删除笔记？")).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(remove.mock.calls[0]?.[1].params).toEqual({ path: { noteId: 42 } });
  });

  it("确认框里点取消不发请求", async () => {
    renderWithProviders(<NoteList baseId={7} />);

    fireEvent.click(await screen.findByTestId("note-actions-42"));
    fireEvent.click(await screen.findByText("删除笔记"));
    fireEvent.click(await screen.findByRole("button", { name: "取消" }));

    expect(remove).not.toHaveBeenCalled();
  });

  it("空态的新建笔记按钮打开与页头相同的对话框", async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve(
        url === "/notes" ? envelope({ current: 1, pages: 1, total: 0, rows: [] }) : routeGet(url),
      ),
    );
    renderWithProviders(<NoteList baseId={7} />);

    expect(await screen.findByText("这个知识库还没有笔记")).toBeInTheDocument();
    // 页头一个、空态一个，都是同一个 CreateNoteDialog
    expect(screen.getAllByTestId(/note-create/)).toHaveLength(2);

    fireEvent.click(screen.getByTestId("note-create-empty"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("标题")).toBeInTheDocument();
  });

  it("加载失败显示 QueryError，点重试重新请求", async () => {
    get.mockImplementation((url: string) =>
      url === "/notes" ? Promise.resolve(envelope(null, "B0400")) : Promise.resolve(routeGet(url)),
    );
    renderWithProviders(<NoteList baseId={7} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("笔记加载失败：");

    get.mockImplementation((url: string) => Promise.resolve(routeGet(url)));
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => expect(screen.getByText("重构方案")).toBeInTheDocument());
  });
});
