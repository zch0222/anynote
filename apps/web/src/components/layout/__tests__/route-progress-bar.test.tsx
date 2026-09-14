import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouteProgressBar } from "../route-progress-bar";

/**
 * 顶栏路由进度条**不能占布局高度**。
 *
 * 这是一个真实发生过的 bug：进度条用 `sticky top-14 h-0.5` 放在顶栏与内容区
 * 之间的文档流里，于是一亮起来就给下面所有内容加 2px，整页往下沉一下；
 * 导航结束它被卸载，内容又弹回去。切一次页面抖两次，比没有进度条更糟。
 *
 * 为什么这条要在单测里用**类名契约**钉住：jsdom 不做布局计算，
 * `getBoundingClientRect()` 恒返回 0，量不出"占了 2px"。而真实浏览器里的
 * 像素级验证在 `e2e/loading-system.spec.ts`（量 `#workspace-content` 的位移）。
 * 两者分工：这里钉"高度必须归零 + 可见部分必须脱离文档流"的结构，
 * E2E 钉真实渲染结果。
 */
const active = vi.hoisted(() => ({ current: true }));

vi.mock("@/hooks/use-route-progress", () => ({
  useRouteProgress: () => active.current,
}));

function renderBar(className?: string) {
  return render(<RouteProgressBar {...(className === undefined ? {} : { className })} />);
}

/** 取到承载可见像素的那一条（`data-slot="boot-bar"`）。 */
function bootBar(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-slot="boot-bar"]');
  if (!element) throw new Error("缺少 boot-bar");
  return element;
}

function statusRegion(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-slot="route-progress"]');
  if (!element) throw new Error("缺少 route-progress");
  return element;
}

beforeEach(() => {
  active.current = true;
});

describe("RouteProgressBar 不占高度", () => {
  it("状态容器高度归零——加载条出现时下面的内容不许位移", () => {
    renderBar();
    const region = statusRegion();

    expect(region.className).toContain("h-0");
    /*
     * 反向断言写清楚：`h-0.5` 正是 bug 本身。
     * Tailwind 里 `h-0` 与 `h-0.5` 同时存在时后者胜出，只查 `h-0` 会漏掉这种写法。
     */
    expect(region.className).not.toContain("h-0.5");
  });

  it("可见的 2px 条脱离文档流，只有脱离才谈得上不占高度", () => {
    renderBar();
    const bar = bootBar();

    expect(bar.className).toContain("absolute");
    expect(bar.className).toContain("h-0.5");
    // 贴在零高容器的上沿，于是视觉位置与原来「紧跟顶栏」完全一致
    expect(bar.className).toContain("top-0");
    expect(bar.className).toContain("inset-x-0");
  });

  it("零高度容器不用 overflow-hidden——那会把绝对定位的条一起裁掉", () => {
    renderBar();
    // h-0 + overflow-hidden 会让进度条彻底看不见（裁到 0 高）
    expect(statusRegion().className).not.toContain("overflow-hidden");
  });

  it("整条不吃指针事件，2px 的条不许盖住底下的可点区域", () => {
    renderBar();
    expect(statusRegion().className).toContain("pointer-events-none");
  });

  it("状态语义与文案保持：读屏仍播报「页面加载中」", () => {
    renderBar();
    const region = statusRegion();

    // <output> 的隐式 role 就是 status
    expect(region.tagName).toBe("OUTPUT");
    expect(region.textContent).toContain("页面加载中");
    // 不确定型进度：不编造百分比
    expect(region).not.toHaveAttribute("aria-valuenow");
  });

  it("不活跃时整条不渲染——否则每次切页都多播报一次状态", () => {
    active.current = false;
    renderBar();
    expect(document.querySelector('[data-slot="route-progress"]')).toBeNull();
  });

  it("移动端覆盖定位后高度仍然归零", () => {
    // MobileShell 传的是 fixed 版定位；twMerge 要能把 sticky/top-14 换掉而不带回高度
    renderBar("pointer-events-none fixed inset-x-0 top-0 z-40");
    const region = statusRegion();

    expect(region.className).toContain("fixed");
    expect(region.className).toContain("top-0");
    expect(region.className).not.toContain("sticky");
    expect(region.className).not.toContain("top-14");
    expect(region.className).toContain("h-0");
    expect(region.className).not.toContain("h-0.5");
  });
});
