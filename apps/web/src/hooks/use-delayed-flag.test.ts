import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 延迟开关。它是「首帧之后才出现」与「超过 1.2s 才切骨架」两条设计要求的
 * 唯一实现，所以边界要钉死：
 * - `delayMs <= 0` 必须**同步**为 true（调用方不该为"不延迟"再写一个分支）
 * - 延迟未到之前必须是 false（否则两个设计要求都白写）
 * - 卸载要清掉计时器（路由切换会频繁挂卸，漏清就是定时器泄漏 + 卸载后 setState）
 */
describe("useDelayedFlag", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("delayMs 为 0 时立即为 true", () => {
    const { result } = renderHook(() => useDelayedFlag(0));
    expect(result.current).toBe(true);
  });

  it("负数同样立即为 true（当作「不要延迟」）", () => {
    const { result } = renderHook(() => useDelayedFlag(-1));
    expect(result.current).toBe(true);
  });

  it("延迟未到之前保持 false——快速切换不该闪一下加载态", () => {
    const { result } = renderHook(() => useDelayedFlag(120));
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(119);
    });
    expect(result.current).toBe(false);
  });

  it("延迟到点后翻成 true", () => {
    const { result } = renderHook(() => useDelayedFlag(120));
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(result.current).toBe(true);
  });

  it("卸载清掉计时器，不在卸载后 setState", () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = renderHook(() => useDelayedFlag(500));
    clearSpy.mockClear();
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });

  it("delayMs 变化时重新计时（骨架阈值可被调用方覆写成 0 来关闭）", () => {
    const { result, rerender } = renderHook(({ delay }) => useDelayedFlag(delay), {
      initialProps: { delay: 1000 },
    });
    expect(result.current).toBe(false);
    rerender({ delay: 0 });
    expect(result.current).toBe(true);
  });
});
