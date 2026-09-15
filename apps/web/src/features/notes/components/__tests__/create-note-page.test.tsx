import { noteApi } from "@/lib/api/openapi";
import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateNotePage } from "../create-note-page";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { PATCH: vi.fn(), GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  // CreateBaseDialog 按当前版式决定创建后的跳转，会读 pathname
  usePathname: () => "/notes",
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

  it("initialBaseId 预选归属库，不再退回第一个", async () => {
    get.mockResolvedValue(
      envelope({
        rows: [
          { id: 100, knowledgeBaseName: "甲库" },
          { id: 200, knowledgeBaseName: "乙库" },
        ],
      }),
    );
    post.mockResolvedValue(envelope(77));
    renderWithProviders(<CreateNotePage initialBaseId={200} />);

    await waitFor(() => expect(screen.getByRole("button", { name: /乙库/ })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /乙库/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /甲库/ })).toHaveAttribute("aria-pressed", "false");

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "预选归属" } });
    fireEvent.click(screen.getByRole("button", { name: "创建笔记" }));

    await waitFor(() =>
      expect(post.mock.calls[0]?.[1].body).toEqual({ knowledgeBaseId: 200, title: "预选归属" }),
    );
  });

  it("没有任何知识库时引导先建库", async () => {
    get.mockResolvedValue(envelope({ rows: [] }));
    renderWithProviders(<CreateNotePage />);

    await waitFor(() => expect(screen.getByText("还没有知识库")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /新建知识库/u })).toBeInTheDocument();
  });

  it("知识库加载失败展示错误信息并可重试", async () => {
    get.mockResolvedValue({
      response: new Response(JSON.stringify({ code: "A0301", msg: "未授权" }), { status: 200 }),
    });
    renderWithProviders(<CreateNotePage />);

    await waitFor(() => expect(screen.getByText(/知识库加载失败/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
});

/** D-03 图例 17：末尾的虚线卡片「新建知识库」。 */
describe("CreateNotePage 末尾的新建知识库入口", () => {
  it("有知识库时也在选项末尾出虚线卡片，与选项同尺寸", async () => {
    get.mockResolvedValue(envelope({ rows: [{ id: 100, knowledgeBaseName: "甲库" }] }));
    renderWithProviders(<CreateNotePage />);

    const trigger = await screen.findByTestId("create-note-new-base");
    expect(trigger).toHaveTextContent("新建知识库");
    // 虚线边框 + accent 文本（图例 17 的形态），高度与选项一致
    expect(trigger.className).toContain("border-dashed");
    expect(trigger.className).toContain("text-accent");
    expect(trigger.className).toContain("min-h-16");
    // 排在选项之后
    const option = screen.getByTestId("base-option-100");
    expect(option.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("创建成功后留在本页、自动选中新库并失效知识库列表", async () => {
    // 第一次拉列表只有甲库；POST 之后（失效重取）才带上新库，模拟真实后端
    let created = false;
    get.mockImplementation((path: string) => {
      if (path === "/bases") {
        return Promise.resolve(
          envelope({
            rows: created
              ? [
                  { id: 100, knowledgeBaseName: "甲库" },
                  { id: 300, knowledgeBaseName: "新库" },
                ]
              : [{ id: 100, knowledgeBaseName: "甲库" }],
          }),
        );
      }
      return Promise.resolve(envelope(null));
    });
    post.mockImplementation((path: string) => {
      if (path === "/bases") {
        created = true;
        // 后端返回新库 id
        return Promise.resolve(envelope({ id: 300 }));
      }
      return Promise.resolve(envelope(88));
    });

    renderWithProviders(<CreateNotePage />);
    fireEvent.click(await screen.findByTestId("create-note-new-base"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("名称"), { target: { value: "新库" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建" }));

    // 新库出现在选项里，并且**已经是选中的那一个**
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /新库/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(screen.getByRole("button", { name: /甲库/ })).toHaveAttribute("aria-pressed", "false");
    // 留在本页：没有跳进新库
    expect(push).not.toHaveBeenCalled();

    // 归属确实变成了新库
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "归到新库" } });
    fireEvent.click(screen.getByRole("button", { name: "创建笔记" }));

    await waitFor(() =>
      expect(post.mock.calls.at(-1)?.[1].body).toEqual({
        knowledgeBaseId: 300,
        title: "归到新库",
      }),
    );
  });
});

/** D-03 图例 19 / 23。 */
describe("CreateNotePage 标题输入与取消", () => {
  it("标题输入框 40 高、圆角 md、关掉自动填充", async () => {
    get.mockResolvedValue(envelope({ rows: [{ id: 100, knowledgeBaseName: "甲库" }] }));
    renderWithProviders(<CreateNotePage />);

    const input = await screen.findByLabelText("标题");
    expect(input.className).toContain("h-10");
    expect(input.className).toContain("rounded-md");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("placeholder", "3-15 个字符");
  });

  it("计数随输入更新，超出 15 转 danger", async () => {
    get.mockResolvedValue(envelope({ rows: [{ id: 100, knowledgeBaseName: "甲库" }] }));
    renderWithProviders(<CreateNotePage />);

    const input = await screen.findByLabelText("标题");
    const counter = screen.getByTestId("title-counter");

    expect(counter).toHaveTextContent("0 / 15");
    expect(counter.className).toContain("text-label-tertiary");

    fireEvent.change(input, { target: { value: "五个字符啊" } });
    expect(counter).toHaveTextContent("5 / 15");
    expect(counter.className).not.toContain("text-danger");

    fireEvent.change(input, { target: { value: "一二三四五六七八九十一二三四五六" } });
    expect(counter).toHaveTextContent("16 / 15");
    expect(counter.className).toContain("text-danger");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("带 ?baseId 进来时「取消」回该库", async () => {
    get.mockResolvedValue(envelope({ rows: [{ id: 200, knowledgeBaseName: "乙库" }] }));
    renderWithProviders(<CreateNotePage initialBaseId={200} />);

    const cancel = await screen.findByRole("link", { name: "取消" });
    expect(cancel).toHaveAttribute("href", "/notes/200");
  });

  it("没有 ?baseId 时「取消」回知识库列表", async () => {
    get.mockResolvedValue(envelope({ rows: [{ id: 100, knowledgeBaseName: "甲库" }] }));
    renderWithProviders(<CreateNotePage />);

    const cancel = await screen.findByRole("link", { name: "取消" });
    expect(cancel).toHaveAttribute("href", "/notes");
  });
});
