import { useVisualViewportHeight } from "@/hooks/use-visual-viewport";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type Listener = () => void;

/** 最小可用的 visualViewport 打桩：能改高度、能派发事件、能数监听器。 */
function stubVisualViewport(initialHeight: number) {
  const listeners = new Map<string, Set<Listener>>();
  const viewport = {
    height: initialHeight,
    offsetTop: 0,
    addEventListener: (type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(listener);
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
    emit: (type: string) => {
      for (const listener of listeners.get(type) ?? []) listener();
    },
    count: (type: string) => listeners.get(type)?.size ?? 0,
  };
  vi.stubGlobal("visualViewport", viewport);
  return viewport;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useVisualViewportHeight", () => {
  it("挂载时同步一次当前高度", () => {
    stubVisualViewport(812);
    const { result } = renderHook(() => useVisualViewportHeight());
    expect(result.current).toBe(812);
  });

  it("软键盘弹出（resize）后跟着变小", () => {
    const viewport = stubVisualViewport(812);
    const { result } = renderHook(() => useVisualViewportHeight());

    act(() => {
      viewport.height = 480;
      viewport.emit("resize");
    });

    expect(result.current).toBe(480);
  });

  it("只派发 scroll 的浏览器也能被兜住", () => {
    const viewport = stubVisualViewport(812);
    const { result } = renderHook(() => useVisualViewportHeight());

    act(() => {
      viewport.height = 500;
      viewport.emit("scroll");
    });

    expect(result.current).toBe(500);
  });

  it("不支持 visualViewport 时返回 null，让调用方回退 100svh", () => {
    vi.stubGlobal("visualViewport", undefined);
    const { result } = renderHook(() => useVisualViewportHeight());
    expect(result.current).toBeNull();
  });

  it("卸载后不再持有监听器", () => {
    const viewport = stubVisualViewport(812);
    const { unmount } = renderHook(() => useVisualViewportHeight());
    expect(viewport.count("resize")).toBe(1);
    expect(viewport.count("scroll")).toBe(1);

    unmount();

    expect(viewport.count("resize")).toBe(0);
    expect(viewport.count("scroll")).toBe(0);
  });
});
