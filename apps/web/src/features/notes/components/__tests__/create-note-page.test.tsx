import { noteApi } from "@/lib/api/openapi";
import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateNotePage } from "../create-note-page";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { PATCH: vi.fn(), GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const get = noteApi.GET as unknown as Mock;
const post = noteApi.POST as unknown as Mock;

function envelope(data: unknown, code = "00000") {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  };
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  push.mockReset();
});

describe("CreateNotePage", () => {
  it("加载知识库列表，默认选中第一个，提交后跳转到新笔记", async () => {
    get.mockResolvedValue(
      envelope({
        rows: [
          { id: 100, knowledgeBaseName: "甲库" },
          { id: 200, knowledgeBaseName: "乙库" },
        ],
      }),
    );
    post.mockResolvedValue(envelope(88));
    renderWithProviders(<CreateNotePage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "甲库" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "甲库" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "乙库" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "新笔记标题" } });
    fireEvent.click(screen.getByRole("button", { name: "创建笔记" }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[1].body).toEqual({ knowledgeBaseId: 100, title: "新笔记标题" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/notes/100/88"));
  });

  it("切换选中的知识库后按新归属创建", async () => {
    get.mockResolvedValue(
      envelope({
        rows: [
          { id: 100, knowledgeBaseName: "甲库" },
          { id: 200, knowledgeBaseName: "乙库" },
        ],
      }),
    );
    post.mockResolvedValue(envelope(99));
    renderWithProviders(<CreateNotePage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "乙库" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "乙库" }));
    expect(screen.getByRole("button", { name: "乙库" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "归属乙库" } });
    fireEvent.click(screen.getByRole("button", { name: "创建笔记" }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[1].body).toEqual({ knowledgeBaseId: 200, title: "归属乙库" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/notes/200/99"));
  });

  it("标题不满足 3-15 位时不发请求并提示", async () => {
    get.mockResolvedValue(envelope({ rows: [{ id: 100, knowledgeBaseName: "甲库" }] }));
    renderWithProviders(<CreateNotePage />);

    await waitFor(() => expect(screen.getByText("甲库")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: "创建笔记" }));

    await waitFor(() => expect(screen.getByText("标题至少 3 个字符")).toBeInTheDocument());
    expect(post).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("没有任何知识库时引导先建库", async () => {
    get.mockResolvedValue(envelope({ rows: [] }));
    renderWithProviders(<CreateNotePage />);

    await waitFor(() => expect(screen.getByText("还没有知识库")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /新建知识库/u })).toBeInTheDocument();
  });

  it("知识库加载失败展示错误信息", async () => {
    get.mockResolvedValue({
      response: new Response(JSON.stringify({ code: "A0301", msg: "未授权" }), { status: 200 }),
    });
    renderWithProviders(<CreateNotePage />);

    await waitFor(() => expect(screen.getByText(/知识库加载失败/)).toBeInTheDocument());
  });
});
