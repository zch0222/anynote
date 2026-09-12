import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/m/notes/3/7",
}));

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { renderWithProviders } from "@/test/render";

describe("MobileScreen", () => {
  it("渲染标题与内容，默认不显示返回键", () => {
    renderWithProviders(
      <MobileScreen title="笔记">
        <p>正文</p>
      </MobileScreen>,
    );
    expect(screen.getByRole("heading", { name: "笔记" })).toBeInTheDocument();
    expect(screen.getByText("正文")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-back")).toBeNull();
  });

  it("back 为 true 时点击返回键走浏览器历史", () => {
    renderWithProviders(
      <MobileScreen title="详情" back>
        <p>正文</p>
      </MobileScreen>,
    );
    fireEvent.click(screen.getByTestId("mobile-back"));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("没有站内历史时用兜底地址，而不是 back() 退出站点", () => {
    // 直接打开分享链接的情形：history.length 为 1
    const original = window.history.length;
    Object.defineProperty(window.history, "length", { value: 1, configurable: true });

    renderWithProviders(
      <MobileScreen title="详情" back="/m/notes">
        <p>正文</p>
      </MobileScreen>,
    );
    fireEvent.click(screen.getByTestId("mobile-back"));

    expect(router.push).toHaveBeenCalledWith("/m/notes");
    expect(router.back).not.toHaveBeenCalled();
    Object.defineProperty(window.history, "length", { value: original, configurable: true });
  });

  it("有历史时即使给了兜底地址也优先回退", () => {
    Object.defineProperty(window.history, "length", { value: 5, configurable: true });
    renderWithProviders(
      <MobileScreen title="详情" back="/m/notes">
        <p>正文</p>
      </MobileScreen>,
    );
    fireEvent.click(screen.getByTestId("mobile-back"));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("渲染右侧动作与顶栏下方工具条", () => {
    renderWithProviders(
      <MobileScreen
        title="笔记"
        actions={<button type="button">更多</button>}
        toolbar={<span>筛选条</span>}
      >
        <p>正文</p>
      </MobileScreen>,
    );
    expect(screen.getByRole("button", { name: "更多" })).toBeInTheDocument();
    expect(screen.getByText("筛选条")).toBeInTheDocument();
  });

  it("fill 让内容区占满可用高度（编辑器 / 对话页依赖它内部滚动）", () => {
    renderWithProviders(
      <MobileScreen title="编辑" fill>
        <p>正文</p>
      </MobileScreen>,
    );
    expect(screen.getByTestId("mobile-content")).toHaveAttribute("data-fill", "true");
  });

  it("默认不占满高度，普通列表页整页自然滚动", () => {
    renderWithProviders(
      <MobileScreen title="列表">
        <p>正文</p>
      </MobileScreen>,
    );
    expect(screen.getByTestId("mobile-content")).not.toHaveAttribute("data-fill");
  });
});
