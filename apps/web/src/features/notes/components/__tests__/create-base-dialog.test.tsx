import {
  knowledgeBaseSectionHref,
  mobileKnowledgeBaseSectionHref,
} from "@/components/layout/navigation";
import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, replace, mutateAsync } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  mutateAsync: vi.fn(),
}));

const pathname = vi.hoisted(() => ({ current: "/notes" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push, replace }),
}));

vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useCreateKnowledgeBaseMutation: () => ({ mutateAsync, isPending: false }),
}));

import { CreateBaseDialog } from "../create-base-dialog";

beforeEach(() => {
  vi.clearAllMocks();
  pathname.current = "/notes";
  mutateAsync.mockResolvedValue(42);
  // 关闭时读 window.location.search 判断有没有 ?new=1
  window.history.replaceState({}, "", "/notes");
});

/**
 * 新建知识库对话框。
 *
 * 两条契约容易被改坏，这里钉住：
 * 1. 触发元素必须真的能打开对话框（`trigger` 是内容不是元素，套 `<button>` 会形成
 *    非法嵌套，Base UI 也会按 `nativeButton` 处理，表现为"点不开"）；
 * 2. 创建后的跳转要跟着当前版式走，不能从 `/m/*` 把人扔进桌面布局。
 */
describe("CreateBaseDialog", () => {
  it("默认触发元素是可点的按钮，点击后打开对话框", async () => {
    renderWithProviders(<CreateBaseDialog />);
    fireEvent.click(screen.getByRole("button", { name: /新建知识库/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("名称")).toBeInTheDocument();
    expect(screen.getByLabelText("简介")).toBeInTheDocument();
  });

  it("自定义触发内容时同样能打开对话框", async () => {
    renderWithProviders(
      <CreateBaseDialog triggerTestId="custom-trigger" trigger={<span>建一个</span>} />,
    );
    const trigger = screen.getByTestId("custom-trigger");
    // 自定义内容不能被包成按钮：套 button 会得到非法嵌套
    expect(trigger.tagName).not.toBe("BUTTON");
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("defaultOpen 打开时直接可见（画廊 ?new=1 的落地形态）", () => {
    renderWithProviders(<CreateBaseDialog defaultOpen />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("桌面端创建成功后跳进新库", async () => {
    pathname.current = "/notes";
    renderWithProviders(<CreateBaseDialog />);
    fireEvent.click(screen.getByRole("button", { name: /新建知识库/ }));
    fireEvent.change(await screen.findByLabelText("名称"), { target: { value: "新库" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/notes/42"));
  });

  it("移动端创建成功后跳进移动版地址，不跨版式", async () => {
    pathname.current = "/m/notes";
    renderWithProviders(<CreateBaseDialog />);
    fireEvent.click(screen.getByRole("button", { name: /新建知识库/ }));
    fireEvent.change(await screen.findByLabelText("名称"), { target: { value: "新库" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/m/notes/42"));
  });

  it("redirectOnCreated 为 false 时留在原地", async () => {
    renderWithProviders(<CreateBaseDialog redirectOnCreated={false} />);
    fireEvent.click(screen.getByRole("button", { name: /新建知识库/ }));
    fireEvent.change(await screen.findByLabelText("名称"), { target: { value: "新库" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
    expect(push).not.toHaveBeenCalled();
  });

  it("创建失败时不跳转（错误由 toast 呈现，弹窗留在原地）", async () => {
    mutateAsync.mockRejectedValue(new Error("名称重复"));
    renderWithProviders(<CreateBaseDialog />);
    fireEvent.click(screen.getByRole("button", { name: /新建知识库/ }));
    fireEvent.change(await screen.findByLabelText("名称"), { target: { value: "新库" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

/** D-04 ②15 / ②16：「关闭并清空表单」，从 `?new=1` 打开时还要摘掉该参数。 */
describe("CreateBaseDialog 关闭行为", () => {
  it("「取消」关闭对话框并清空表单", async () => {
    renderWithProviders(<CreateBaseDialog />);
    fireEvent.click(screen.getByRole("button", { name: /新建知识库/ }));
    fireEvent.change(await screen.findByLabelText("名称"), { target: { value: "写了一半" } });
    fireEvent.change(screen.getByLabelText("简介"), { target: { value: "草稿" } });

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByLabelText("名称")).not.toBeInTheDocument();

    // 再打开时是空表单：留着上次没提交的内容会让人以为"已经建过了"
    fireEvent.click(screen.getByRole("button", { name: /新建知识库/ }));
    expect(await screen.findByLabelText("名称")).toHaveValue("");
    expect(screen.getByLabelText("简介")).toHaveValue("");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("从 ?new=1 打开时，关闭后地址栏不再带该参数", async () => {
    window.history.replaceState({}, "", "/notes?new=1");
    renderWithProviders(<CreateBaseDialog defaultOpen />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    // 不带参数：回到裸路径；用 replace 而不是 push，后退里不多一格
    expect(replace).toHaveBeenCalledWith("/notes", { scroll: false });
    expect(push).not.toHaveBeenCalled();
  });

  it("?new=1 之外还带别的参数时只摘掉 new", async () => {
    window.history.replaceState({}, "", "/notes?scope=mine&new=1");
    renderWithProviders(<CreateBaseDialog defaultOpen />);

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/notes?scope=mine", { scroll: false }));
  });

  it("地址栏没有 ?new=1 时不做无谓的 history 操作", async () => {
    window.history.replaceState({}, "", "/notes");
    renderWithProviders(<CreateBaseDialog />);
    fireEvent.click(screen.getByRole("button", { name: /新建知识库/ }));
    fireEvent.click(await screen.findByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

/** 桌面与移动端二级 Tab 的地址前缀必须各自正确——两者由同一个枚举派生。 */
describe("二级 Tab 地址在两套版式下同构", () => {
  it("移动端地址就是桌面地址加 /m 前缀", () => {
    for (const section of ["notes", "overview", "mooc", "tasks", "docs", "members"] as const) {
      expect(mobileKnowledgeBaseSectionHref(9, section)).toBe(
        `/m${knowledgeBaseSectionHref(9, section)}`,
      );
    }
  });
});
