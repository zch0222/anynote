import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Segmented } from "@/components/ui/segmented";
import { renderWithProviders } from "@/test/render";

const OPTIONS = [
  { value: "catalog", label: "目录" },
  { value: "content", label: "内容" },
] as const;

/*
 * 形状变体（2026-09-20 移动端还原度核对）：移动端画板（M-04 / M-06）的分段控件
 * 是全圆胶囊，桌面端沿用小圆角。两个口径都由这个组件出（`src/components/ui`
 * 的测试被 vitest exclude，按惯例放这里），断言防止后来人把某一侧的形状
 * 改到另一侧去。
 */
describe("Segmented · 形状变体", () => {
  it("缺省小圆角（桌面端），shape=pill 全圆胶囊（移动端画板口径）", () => {
    const onChange = vi.fn();
    const { container, unmount } = renderWithProviders(
      <Segmented label="课程视图" options={OPTIONS} value="catalog" onChange={onChange} />,
    );
    const track = container.querySelector("[data-slot='segmented']") as HTMLElement;
    expect(track.className).toMatch(/rounded-md/);
    expect(track.className).not.toMatch(/rounded-full/);
    unmount();

    const pill = renderWithProviders(
      <Segmented
        label="课程视图"
        options={OPTIONS}
        value="catalog"
        onChange={onChange}
        shape="pill"
      />,
    );
    const pillTrack = pill.container.querySelector("[data-slot='segmented']") as HTMLElement;
    expect(pillTrack.className).toMatch(/rounded-full/);
    const thumb = pill.container.querySelector(
      "[role='radio'][aria-checked='true']",
    ) as HTMLElement;
    expect(thumb.className).toMatch(/rounded-full/);
  });

  it("形状不影响单选语义与回调", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <Segmented
        label="课程视图"
        options={OPTIONS}
        value="catalog"
        onChange={onChange}
        shape="pill"
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "内容" }));
    expect(onChange).toHaveBeenCalledWith("content");
  });
});
