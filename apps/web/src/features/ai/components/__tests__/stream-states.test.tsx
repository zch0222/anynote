import { AiAvatar, StreamCaret, ThinkingDots } from "@/features/ai/components/stream-states";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * AI 流式三态的零件。
 *
 * 三处不能随手改的性质：
 * 1. 三点**必须错峰**（0.15s 递进）——同时亮灭看起来是"闪一下"而不是"在思考"。
 * 2. 光标用 `step-end` 跳（不是淡入淡出）——淡入淡出会被读成另一种"加载中"。
 * 3. 光标 `aria-hidden`——它是视觉提示，不是需要播报的内容。
 */
describe("ThinkingDots", () => {
  it("三个点，延迟按 0.15s 递进错峰", () => {
    const { container } = render(<ThinkingDots />);
    const dots = container.querySelectorAll("[data-dot]");
    expect(dots).toHaveLength(3);
    expect((dots[0] as HTMLElement).style.animationDelay).toBe("0s");
    expect((dots[1] as HTMLElement).style.animationDelay).toBe("0.15s");
    expect((dots[2] as HTMLElement).style.animationDelay).toBe("0.3s");
  });

  it("每个点都挂 think-dot 关键帧（1.2s 循环）", () => {
    const { container } = render(<ThinkingDots />);
    for (const dot of container.querySelectorAll("[data-dot]")) {
      expect(dot.getAttribute("class")).toContain("animate-think-dot");
    }
  });

  it("整体对读屏隐藏——「思考中」的文字语义由外层 output 承担", () => {
    const { container } = render(<ThinkingDots />);
    expect(
      container.querySelector('[data-slot="thinking-dots"]')?.getAttribute("aria-hidden"),
    ).toBe("true");
  });
});

describe("StreamCaret", () => {
  it("挂 caret-blink 关键帧（step-end 跳，不是淡入淡出）", () => {
    const { container } = render(<StreamCaret />);
    const caret = container.querySelector('[data-slot="stream-caret"]');
    expect(caret?.getAttribute("class")).toContain("animate-caret-blink");
  });

  it("aria-hidden：光标是视觉提示，不需要播报", () => {
    const { container } = render(<StreamCaret />);
    expect(container.querySelector('[data-slot="stream-caret"]')?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("用 accent 色，跟得上品牌强调色换主题", () => {
    const { container } = render(<StreamCaret />);
    expect(container.querySelector('[data-slot="stream-caret"]')?.getAttribute("class")).toContain(
      "bg-accent",
    );
  });

  it("类名可覆写（编辑器内联光标尺寸不同）", () => {
    const { container } = render(<StreamCaret className="h-5 w-0.5 bg-success" />);
    const caret = container.querySelector('[data-slot="stream-caret"]');
    expect(caret?.getAttribute("class")).toBe("h-5 w-0.5 bg-success");
  });
});

describe("AiAvatar", () => {
  it("思考中用方角块（与三点的「进行中」视觉同族），完成后回到圆形", () => {
    const { container, rerender } = render(<AiAvatar thinking />);
    expect(container.querySelector("span")?.getAttribute("class")).toContain("rounded-lg");

    rerender(<AiAvatar />);
    expect(container.querySelector("span")?.getAttribute("class")).toContain("rounded-full");
  });

  it("对读屏隐藏（旁边就是消息正文，头像没有信息量）", () => {
    const { container } = render(<AiAvatar />);
    expect(container.querySelector("span")?.getAttribute("aria-hidden")).toBe("true");
  });
});
