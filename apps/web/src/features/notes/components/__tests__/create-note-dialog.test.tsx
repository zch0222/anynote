import { noteApi } from "@/lib/api/openapi";
import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateNoteDialog } from "../create-note-dialog";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { PATCH: vi.fn(), GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const get = noteApi.GET as unknown as Mock;
const post = noteApi.POST as unknown as Mock;

const BASE_ID = 7;

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
  get.mockImplementation((path: string) => {
    if (path === "/bases/{id}") {
      return Promise.resolve(
        envelope({ id: BASE_ID, knowledgeBaseName: "产品设计知识库", permissions: 2 }),
      );
    }
    return Promise.resolve(envelope(null));
  });
});

/**
 * D-04 ①：对话框里的归属提示与页脚「取消」。
 *
 * 两条都是"让人不必猜"的补丁：不提库名，用户不知道这篇会落到哪；
 * 没有取消键，不熟悉 Esc 的人只能去点右上角的 ×。
 */
describe("CreateNoteDialog（D-04 ①）", () => {
  it("标题下有归属提示胶囊，报出库名", async () => {
    renderWithProviders(<CreateNoteDialog knowledgeBaseId={BASE_ID} />);

    fireEvent.click(screen.getByRole("button", { name: /新建笔记/ }));
    const hint = await screen.findByTestId("create-note-base-hint");

    expect(hint).toHaveTextContent("创建到");
    await waitFor(() => expect(hint).toHaveTextContent("产品设计知识库"));
    // 28 高胶囊 + 底 fill（图例 ①3）
    expect(hint.className).toContain("min-h-7");
    expect(hint.className).toContain("rounded-full");
    expect(hint.className).toContain("bg-fill-hover");
  });

  it("库名还没取到时用中性兜底文案，不显示空白", async () => {
    get.mockImplementation(() => Promise.resolve(envelope(null)));
    renderWithProviders(<CreateNoteDialog knowledgeBaseId={BASE_ID} />);

    fireEvent.click(screen.getByRole("button", { name: /新建笔记/ }));
    const hint = await screen.findByTestId("create-note-base-hint");
    await waitFor(() => expect(hint).toHaveTextContent("当前知识库"));
  });

  it("页脚有「取消」，点击关闭并清空表单", async () => {
    renderWithProviders(<CreateNoteDialog knowledgeBaseId={BASE_ID} />);
    fireEvent.click(screen.getByRole("button", { name: /新建笔记/ }));
    fireEvent.change(await screen.findByLabelText("标题"), { target: { value: "写了一半" } });

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByLabelText("标题")).not.toBeInTheDocument();

    // 再打开是空表单
    fireEvent.click(screen.getByRole("button", { name: /新建笔记/ }));
    expect(await screen.findByLabelText("标题")).toHaveValue("");
    expect(post).not.toHaveBeenCalled();
  });

  it("取消与创建并排在页脚，主按钮在最右", async () => {
    renderWithProviders(<CreateNoteDialog knowledgeBaseId={BASE_ID} />);
    fireEvent.click(screen.getByRole("button", { name: /新建笔记/ }));

    const dialog = await screen.findByRole("dialog");
    const footer = dialog.querySelector('[data-slot="dialog-footer"]');
    expect(footer).not.toBeNull();
    const labels = [...(footer?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
    // 取消在前、创建在后（主按钮最右）
    expect(labels).toEqual(["取消", "创建"]);
  });
});
