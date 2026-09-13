import {
  knowledgeBaseSectionHref,
  mobileKnowledgeBaseSectionHref,
} from "@/components/layout/navigation";
import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, mutateAsync } = vi.hoisted(() => ({
  push: vi.fn(),
  mutateAsync: vi.fn(),
}));

const pathname = vi.hoisted(() => ({ current: "/notes" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push }),
}));

vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useCreateKnowledgeBaseMutation: () => ({ mutateAsync, isPending: false }),
}));

import { CreateBaseDialog } from "../create-base-dialog";

beforeEach(() => {
  vi.clearAllMocks();
  pathname.current = "/notes";
  mutateAsync.mockResolvedValue(42);
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
