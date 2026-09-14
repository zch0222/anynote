import { BrandBoot } from "@/components/layout/brand-boot";
import { AnynoteLogo } from "@/components/layout/brand-logo";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 品牌启动。设计稿 P16 给了三条会被"看起来差不多的实现"违反的约束，
 * 每条都钉一个用例：
 * 1. 首帧之后才出现（快速路由切换不该闪一下）
 * 2. 超过 1.2s 才切骨架兜底（别一上来就给一屏骨架）
 * 3. `role="status"` + 文案进 DOM（只有视觉动效不算状态可见）
 */
describe("BrandBoot", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("延迟窗口内什么都不渲染——避免 50ms 就完成的切换闪一下启动页", () => {
    const { container } = render(<BrandBoot delayMs={120} />);
    expect(container.querySelector('[data-slot="brand-boot"]')).toBeNull();
  });

  it("延迟到点后出现：Logo + 字标 + 文案", () => {
    render(<BrandBoot delayMs={120} />);
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.getByText("Anynote")).toBeInTheDocument();
    expect(screen.getByText("正在准备工作区…")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="brand-logo"]')).not.toBeNull();
    // 还是 Logo 阶段，没切骨架
    expect(screen.getByRole("status").getAttribute("data-phase")).toBe("logo");
    expect(document.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it("超过 skeletonAfterMs 仍未就绪才切骨架兜底", () => {
    render(<BrandBoot delayMs={0} skeletonAfterMs={1200} />);
    expect(screen.getByRole("status").getAttribute("data-phase")).toBe("logo");

    act(() => {
      vi.advanceTimersByTime(1199);
    });
    expect(screen.getByRole("status").getAttribute("data-phase")).toBe("logo");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("status").getAttribute("data-phase")).toBe("skeleton");
    // 骨架兜底给两行结构占位（标题位 + 正文位），不承诺具体列表结构
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2);
  });

  it("skeletonAfterMs=0 关闭骨架兜底（路由级启动页用这个）", () => {
    render(<BrandBoot delayMs={0} skeletonAfterMs={0} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole("status").getAttribute("data-phase")).toBe("logo");
    expect(document.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it("容器是 role=status：读屏必须能播报「正在准备工作区」", () => {
    render(<BrandBoot delayMs={0} skeletonAfterMs={0} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("正在准备工作区");
    // 动效本身对读屏隐藏——不需要知道"书在画第几笔"
    expect(document.querySelector('[data-slot="brand-logo"]')?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("全屏态铺满视口高度，内嵌态只占父容器", () => {
    const { container, rerender } = render(<BrandBoot delayMs={0} skeletonAfterMs={0} />);
    expect(container.querySelector('[data-slot="brand-boot"]')?.getAttribute("class")).toContain(
      "min-h-svh",
    );

    rerender(<BrandBoot delayMs={0} skeletonAfterMs={0} fullscreen={false} />);
    expect(container.querySelector('[data-slot="brand-boot"]')?.getAttribute("class")).toContain(
      "h-full",
    );
  });

  it("文案可覆写（移动端复用同一组件）", () => {
    render(<BrandBoot delayMs={0} skeletonAfterMs={0} message="正在准备知识库…" />);
    expect(screen.getByText("正在准备知识库…")).toBeInTheDocument();
  });
});

describe("AnynoteLogo", () => {
  it("三笔各自是一条独立路径——描边动画要能单独控制每一笔", () => {
    const { container } = render(<AnynoteLogo />);
    expect(container.querySelector('[data-logo-stroke="page1"]')).not.toBeNull();
    expect(container.querySelector('[data-logo-stroke="page2"]')).not.toBeNull();
    expect(container.querySelector('[data-logo-stroke="spine"]')).not.toBeNull();
  });

  it("静态用法不带描边动画类，且 dashoffset 归零（画完整的书）", () => {
    const { container } = render(<AnynoteLogo />);
    for (const key of ["page1", "page2", "spine"]) {
      const path = container.querySelector(`[data-logo-stroke="${key}"]`);
      expect(path?.getAttribute("class")).toBeNull();
      expect(path?.getAttribute("stroke-dashoffset")).toBe("0");
    }
  });

  it("动态用法给三笔各自挂上自己的关键帧类", () => {
    const { container } = render(<AnynoteLogo animated />);
    expect(container.querySelector('[data-logo-stroke="page1"]')?.getAttribute("class")).toContain(
      "animate-logo-page-1",
    );
    expect(container.querySelector('[data-logo-stroke="page2"]')?.getAttribute("class")).toContain(
      "animate-logo-page-2",
    );
    expect(container.querySelector('[data-logo-stroke="spine"]')?.getAttribute("class")).toContain(
      "animate-logo-spine",
    );
  });

  it("pathLength=100 归一化：书脊只有一条短线，不归一化会「唰」一下画完", () => {
    const { container } = render(<AnynoteLogo animated />);
    for (const key of ["page1", "page2", "spine"]) {
      const path = container.querySelector(`[data-logo-stroke="${key}"]`);
      expect(path?.getAttribute("pathLength")).toBe("100");
      expect(path?.getAttribute("stroke-dasharray")).toBe("100");
    }
  });

  it("尺寸只用一个数控制，圆角按百分比走（换尺寸比例不走样）", () => {
    const { container } = render(<AnynoteLogo size={56} />);
    const box = container.querySelector('[data-slot="brand-logo"]') as HTMLElement;
    expect(box.style.width).toBe("56px");
    expect(box.style.height).toBe("56px");
    expect(box.getAttribute("class")).toContain("rounded-[25%]");
  });

  it("默认对读屏隐藏；传 label 时成为 img 并有可访问名", () => {
    const { container, rerender } = render(<AnynoteLogo />);
    expect(container.querySelector('[data-slot="brand-logo"]')?.getAttribute("aria-hidden")).toBe(
      "true",
    );

    rerender(<AnynoteLogo label="Anynote" />);
    expect(screen.getByRole("img", { name: "Anynote" })).toBeInTheDocument();
  });

  it("三个笔段的几何：书脊在正中，两页对称（书才是「摊开」的）", () => {
    const { container } = render(<AnynoteLogo />);
    const left = container.querySelector('[data-logo-stroke="page1"]')?.getAttribute("d") ?? "";
    const right = container.querySelector('[data-logo-stroke="page2"]')?.getAttribute("d") ?? "";
    const spine = container.querySelector('[data-logo-stroke="spine"]')?.getAttribute("d") ?? "";
    // 书脊 x 恒为 12（24 视窗的中点），上下端 y 与两页的起止对齐
    expect(spine).toBe("M12 6.7 L12 18.7");
    expect(left.startsWith("M12 6.7")).toBe(true);
    expect(right.startsWith("M12 6.7")).toBe(true);
    expect(left.endsWith("L12 18.7")).toBe(true);
    expect(right.endsWith("L12 18.7")).toBe(true);
    // 外侧页边左右对称
    expect(left).toContain("L6.4 4.6");
    expect(right).toContain("L17.6 4.6");
  });
});
