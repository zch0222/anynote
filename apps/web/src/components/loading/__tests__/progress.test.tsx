import {
  InlineUploadProgress,
  ProgressBar,
  ProgressRing,
  clampPercent,
} from "@/components/loading/progress";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * 进度的行为契约。
 *
 * 重点在两处**容易静默出错**的地方：
 * 1. `clampPercent` 的边界——分片上传会上报 0/100/越界值，NaN 漏进 SVG 属性
 *    会让整条 `stroke-dasharray` 失效（CSS/SVG 对非法值不报错，只让声明作废）。
 * 2. 可访问性——只有一个转动的圈，对读屏用户等于"什么都没发生"，
 *    所以 `aria-valuenow` 必须是真的数值。
 */

describe("clampPercent", () => {
  it("越界值夹到 0–100", () => {
    expect(clampPercent(-10)).toBe(0);
    expect(clampPercent(140)).toBe(100);
  });

  it("小数四舍五入成整数——百分比文字不该出现 42.7%", () => {
    expect(clampPercent(42.4)).toBe(42);
    expect(clampPercent(42.6)).toBe(43);
  });

  it("非有限值按 0 处理：NaN 漏进 SVG 属性会让整条 dasharray 失效", () => {
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampPercent(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("0 与 100 原样返回（两端都是合法终态）", () => {
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(100)).toBe(100);
  });
});

describe("ProgressRing", () => {
  it("role=progressbar 且 valuenow 是真实数值（读屏读得到进度）", () => {
    const { getByRole } = render(<ProgressRing value={62} label="文档索引进度" />);
    const bar = getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("62");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-label")).toBe("文档索引进度");
  });

  it("两个尺寸对应设计稿的 44 / 20pt，且各自有尺寸类", () => {
    const { container, rerender } = render(<ProgressRing value={50} label="x" />);
    let ring = container.querySelector('[data-slot="progress-ring"]');
    expect(ring?.getAttribute("data-size")).toBe("default");
    expect(ring?.getAttribute("class")).toContain("size-11");

    rerender(<ProgressRing value={50} size="compact" label="x" />);
    ring = container.querySelector('[data-slot="progress-ring"]');
    expect(ring?.getAttribute("class")).toContain("size-5");
  });

  it("只有主进度档显示中央百分比——20px 塞不下两位数", () => {
    const { queryByText, rerender } = render(<ProgressRing value={62} label="x" />);
    expect(queryByText("62%")).not.toBeNull();

    rerender(<ProgressRing value={62} size="compact" label="x" />);
    expect(queryByText("62%")).toBeNull();
  });

  it("弧从 12 点方向起画（SVG 的 0° 在 3 点方向，不减 90° 会从右边起跑）", () => {
    const { container } = render(<ProgressRing value={25} label="x" />);
    const arc = container.querySelectorAll("circle")[1];
    expect(arc?.getAttribute("transform")).toBe("rotate(-90 20 20)");
  });

  it("弧长按百分比换算：25% 是整圈的四分之一", () => {
    const { container } = render(<ProgressRing value={25} label="x" />);
    const arc = container.querySelectorAll("circle")[1];
    const [dash] = (arc?.getAttribute("stroke-dasharray") ?? "").split(" ").map(Number);
    // 半径 = (40 - 5.6) / 2 = 17.2 → 周长 108.07
    const circumference = 2 * Math.PI * 17.2;
    expect(dash).toBeCloseTo(circumference * 0.25, 6);
  });

  it("非法值不产生 NaN 属性", () => {
    const { container } = render(<ProgressRing value={Number.NaN} label="x" />);
    const arc = container.querySelectorAll("circle")[1];
    expect(arc?.getAttribute("stroke-dasharray")).not.toContain("NaN");
    expect(container.querySelector('[data-slot="progress-ring"]')?.getAttribute("data-value")).toBe(
      "0",
    );
  });

  it("tone 决定弧色：默认 accent，完成态可切 success", () => {
    const { container, rerender } = render(<ProgressRing value={100} label="x" />);
    expect(container.querySelectorAll("circle")[1]?.getAttribute("class")).toContain(
      "stroke-accent",
    );
    rerender(<ProgressRing value={100} tone="success" label="x" />);
    expect(container.querySelectorAll("circle")[1]?.getAttribute("class")).toContain(
      "stroke-success",
    );
  });
});

describe("ProgressBar", () => {
  it("宽度走 CSS 变量而不是内联 width（仓库禁止内联样式表达动态值）", () => {
    const { getByRole } = render(<ProgressBar value={45} label="PDF 上传进度" />);
    const fill = getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.style.getPropertyValue("--progress")).toBe("45%");
    // 不应直接设 width
    expect(fill.style.width).toBe("");
  });

  it("百分比文字只在 showValue 时出现——外层已有数字时不该重复", () => {
    const { queryByText, rerender } = render(<ProgressBar value={45} label="x" />);
    expect(queryByText("45%")).toBeNull();

    rerender(<ProgressBar value={45} label="x" showValue />);
    expect(queryByText("45%")).not.toBeNull();
  });

  it("百分比数字用等宽，跳数时宽度不抖", () => {
    const { getByText } = render(<ProgressBar value={6} label="x" showValue />);
    expect(getByText("6%").getAttribute("class")).toContain("tabular");
  });

  it("轨道是 4px 全圆", () => {
    const { getByRole } = render(<ProgressBar value={10} label="x" />);
    expect(getByRole("progressbar").getAttribute("class")).toContain("h-1");
    expect(getByRole("progressbar").getAttribute("class")).toContain("rounded-full");
  });
});

describe("InlineUploadProgress", () => {
  it("转圈 + 文案 + 右端百分比三件套", () => {
    const { getByText, container } = render(<InlineUploadProgress value={42} />);
    expect(getByText("图片上传中")).toBeTruthy();
    expect(getByText("42%")).toBeTruthy();
    expect(container.querySelector('[data-slot="spinner"]')).not.toBeNull();
  });

  it("默认文案是设计稿原文「图片上传中」——不显示文件名，长名字会把正文顶得忽长忽短", () => {
    const { getByText, queryByText } = render(<InlineUploadProgress value={10} />);
    expect(getByText("图片上传中")).toBeTruthy();
    expect(queryByText("架构图.png")).toBeNull();
  });

  it("文案可覆写（其它可量化任务复用同一形态）", () => {
    const { getByText } = render(<InlineUploadProgress label="PDF 上传中" value={10} />);
    expect(getByText("PDF 上传中")).toBeTruthy();
  });

  it("文案靠 truncate 收住——单行是硬约束，多行会把下面的正文顶来顶去", () => {
    const { getByText } = render(
      <InlineUploadProgress label={"很长的名字".repeat(20)} value={10} />,
    );
    expect(getByText("很长的名字".repeat(20)).getAttribute("class")).toContain("truncate");
  });

  it("百分比等宽且夹过边界", () => {
    const { getByText } = render(<InlineUploadProgress value={999} />);
    expect(getByText("100%").getAttribute("class")).toContain("tabular");
  });

  it("整行铺满且不换行（它是插在正文流里的占位）", () => {
    const { container } = render(<InlineUploadProgress value={10} />);
    const row = container.querySelector('[data-slot="inline-upload"]');
    expect(row?.getAttribute("class")).toContain("w-full");
    expect(row?.getAttribute("class")).toContain("flex");
  });
});
