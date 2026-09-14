import { SPINNER_SIZE_PX, Spinner } from "@/components/loading/spinner";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * 转圈的行为契约。
 *
 * 这里盯的都是**别的组件依赖它**的性质，不是"能渲染出来"：
 * 尺寸表、`aria-hidden` 的默认、以及弧/轨道两段描边的存在。
 * 尺寸表一旦被谁改宽，同一屏里就会出现三种圈——那是设计稿明确禁止的。
 */
describe("Spinner", () => {
  /** 设计稿 P14 只定义了 4 档，多一档都要回设计稿确认。 */
  const SIZES = SPINNER_SIZE_PX;

  it("4 个尺寸各自对应设计稿的像素值", () => {
    // 逐条写死取值：改了 `SPINNER_SIZE_PX` 而没回设计稿确认时，这条会红
    expect(SIZES).toEqual({ inline: 12, badge: 14, default: 16, button: 20 });
    for (const [size, px] of Object.entries(SIZES)) {
      const { container } = render(<Spinner size={size as keyof typeof SIZES} />);
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("width"), `${size} 应为 ${px}px`).toBe(String(px));
      expect(svg?.getAttribute("height")).toBe(String(px));
      // 内部视窗固定 40：比例因此与尺寸无关，换尺寸不会走样
      expect(svg?.getAttribute("viewBox")).toBe("0 0 40 40");
    }
  });

  it("默认尺寸是 default（16px）", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("16");
  });

  it("不传 label 时对读屏隐藏——它十有八九紧挨着「上传中…」这类文字", () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("role")).toBeNull();
  });

  it("传 label 时成为可播报的 status，且不再是 aria-hidden", () => {
    const { getByRole } = render(<Spinner label="索引构建中" />);
    const status = getByRole("status");
    expect(status.getAttribute("aria-label")).toBe("索引构建中");
    expect(status.getAttribute("aria-hidden")).toBeNull();
  });

  it("一圈灰轨道 + 一段蓝弧：缺了轨道在 12px 下就只剩一个点", () => {
    const { container } = render(<Spinner />);
    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(2);

    // 轨道没有 dasharray（整圈），弧有
    expect(circles[0]?.getAttribute("stroke-dasharray")).toBeNull();
    expect(circles[1]?.getAttribute("stroke-dasharray")).not.toBeNull();

    // 轨道走 separator Token，弧走 currentColor（跟着所在文字变色）
    expect(circles[0]?.getAttribute("class")).toContain("stroke-separator");
    expect(circles[1]?.getAttribute("class")).toContain("stroke-current");
  });

  it("弧长固定为整圈的 80°，且两端圆头", () => {
    const { container } = render(<Spinner />);
    const arc = container.querySelectorAll("circle")[1];
    const dasharray = arc?.getAttribute("stroke-dasharray") ?? "";
    const [dash, gap] = dasharray.split(" ").map(Number);
    // 半径 = (40 - 5.6) / 2 = 17.2 → 周长 108.07
    const circumference = 2 * Math.PI * 17.2;
    expect(dash).toBeCloseTo(circumference * (80 / 360), 6);
    expect(gap).toBeCloseTo(circumference, 6);
    expect(arc?.getAttribute("stroke-linecap")).toBe("round");
  });

  it("弧自己带旋转动画（挂在弧上而不是整个 svg，避免布局收缩时绕偏心点转）", () => {
    const { container } = render(<Spinner />);
    const circles = container.querySelectorAll("circle");
    expect(circles[1]?.getAttribute("class")).toContain("animate-spin-loading");
    expect(circles[1]?.getAttribute("class")).toContain("origin-center");
    expect(circles[0]?.getAttribute("class")).not.toContain("animate-spin-loading");
  });

  it("额外类名合并在 svg 上，调用方仍可改颜色/间距", () => {
    const { container } = render(<Spinner className="text-danger" />);
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-danger");
  });
});
