import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/m/notes/3/7",
}));

import {
  MobileScreen,
  hasInAppHistory,
  resolveTitleVariant,
} from "@/components/layout/mobile/mobile-screen";
import { renderWithProviders } from "@/test/render";

/** 直接改写 `history.state`，模拟"直接打开"与"站内导航进来"两种进入方式。 */
function setHistoryState(state: unknown) {
  window.history.replaceState(state, "", window.location.href);
}

afterEach(() => {
  setHistoryState(null);
});

describe("hasInAppHistory", () => {
  it("Next 的 idx > 0 才算有站内历史", () => {
    expect(hasInAppHistory({ idx: 1 })).toBe(true);
    expect(hasInAppHistory({ idx: 7 })).toBe(true);
    // idx === 0 是 App Router 的首次加载：此时 back() 会离开站点
    expect(hasInAppHistory({ idx: 0 })).toBe(false);
  });

  it("结构不符合预期时保守判定为没有历史", () => {
    expect(hasInAppHistory(null)).toBe(false);
    expect(hasInAppHistory(undefined)).toBe(false);
    expect(hasInAppHistory({})).toBe(false);
    expect(hasInAppHistory({ idx: "1" })).toBe(false);
    expect(hasInAppHistory("idx:1")).toBe(false);
  });
});

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

  /*
   * H-5：画板里详情页顶栏标题是「17/22 SemiBold **居中截断**」
   * （M-03/M-05/M-06/M-08/M-09/M-11/M-12/M-13 原文一致），
   * 而 tab 根页面（M-01 工作台、M-02 我的）是左侧大标题。
   * 原实现一律 `text-base` 左对齐，8–9 屏都偏。
   *
   * 判定按**有没有返回键**推导：有返回键就是"能退出去的详情页"，
   * 没有就是 tab 根页面。让调用方重复声明两者迟早出现自相矛盾的组合。
   */
  it("有返回键时标题居中（详情页形态）", () => {
    renderWithProviders(
      <MobileScreen title="设计系统入门" back="/m/notes/3/mooc">
        <p>正文</p>
      </MobileScreen>,
    );
    const title = screen.getByRole("heading", { name: "设计系统入门" });
    expect(title).toHaveAttribute("data-title-variant", "center");
    expect(title.className).toMatch(/text-center/);
  });

  it("没有返回键时是左侧大标题（tab 根页面形态）", () => {
    renderWithProviders(
      <MobileScreen title="我的">
        <p>正文</p>
      </MobileScreen>,
    );
    const title = screen.getByRole("heading", { name: "我的" });
    expect(title).toHaveAttribute("data-title-variant", "large");
    expect(title.className).not.toMatch(/text-center/);
    // 大标题用 text-display（34/41，画板 M-01 图例 1），不是 22 号
    expect(title.className).toMatch(/text-display/);
  });

  it("显式 titleVariant 覆盖推导结果", () => {
    expect(resolveTitleVariant(undefined)).toBe("large");
    expect(resolveTitleVariant("/m/notes")).toBe("center");
    expect(resolveTitleVariant(true)).toBe("center");
    // 显式值优先：少数页面需要"有返回键但用大标题"这类例外
    expect(resolveTitleVariant("/m/notes", "large")).toBe("large");
    expect(resolveTitleVariant(undefined, "center")).toBe("center");
  });

  it("居中态下两侧各有一个等宽占位，标题才是屏幕正中", () => {
    const { container } = renderWithProviders(
      <MobileScreen title="任务详情" back="/m/notes/3/tasks">
        <p>正文</p>
      </MobileScreen>,
    );
    // 左侧是返回键（size-11 = 44 命中区），右侧是无动作时的占位
    const spacers = container.querySelectorAll("header > span.size-11");
    expect(spacers).toHaveLength(1);
    expect(spacers[0]).toHaveAttribute("aria-hidden", "true");
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

  it("首次加载（idx=0）时用兜底地址，而不是 back() 退到空白页", () => {
    // 直接打开分享链接 / E2E 里的 page.goto：history.length 已是 2（多出 about:blank），
    // 但 Next 的 idx 是 0——判定必须看 idx，看 length 会退回空白页
    setHistoryState({ idx: 0 });
    renderWithProviders(
      <MobileScreen title="详情" back="/m/notes">
        <p>正文</p>
      </MobileScreen>,
    );
    fireEvent.click(screen.getByTestId("mobile-back"));

    expect(router.push).toHaveBeenCalledWith("/m/notes");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("站内导航进来（idx>0）时优先回退", () => {
    setHistoryState({ idx: 3 });
    renderWithProviders(
      <MobileScreen title="详情" back="/m/notes">
        <p>正文</p>
      </MobileScreen>,
    );
    fireEvent.click(screen.getByTestId("mobile-back"));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
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

  /*
   * V01（2026-09-19 核对）：页面底色分两种语义——分组底（白卡坐在灰底上）
   * 与纸面（整页白）。外壳原先统一白底，把分组层次抹平了。
   */
  it("默认分组底，tone=paper 时整页纸面", () => {
    const { unmount } = renderWithProviders(
      <MobileScreen title="工作台">
        <p>正文</p>
      </MobileScreen>,
    );
    expect(screen.getByTestId("mobile-screen")).toHaveAttribute("data-tone", "grouped");
    unmount();
    renderWithProviders(
      <MobileScreen title="课程" tone="paper">
        <p>正文</p>
      </MobileScreen>,
    );
    expect(screen.getByTestId("mobile-screen")).toHaveAttribute("data-tone", "paper");
  });

  it("onBack 覆盖返回键行为（版本页回同路由列表态）", () => {
    const onBack = vi.fn();
    renderWithProviders(
      <MobileScreen title="今天 11:05" back onBack={onBack}>
        <p>正文</p>
      </MobileScreen>,
    );
    fireEvent.click(screen.getByTestId("mobile-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
  });
});
