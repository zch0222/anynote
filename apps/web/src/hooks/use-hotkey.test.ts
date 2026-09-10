import { fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useHotkey } from "./use-hotkey";

describe("useHotkey", () => {
  it.each([{ metaKey: true }, { ctrlKey: true }])(
    "支持 Cmd / Ctrl 并阻止浏览器默认动作 %s",
    (modifier) => {
      const action = vi.fn();
      renderHook(() => useHotkey("k", action));
      const event = new KeyboardEvent("keydown", { key: "K", ...modifier, cancelable: true });
      window.dispatchEvent(event);
      expect(action).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(true);
    },
  );

  it.each([
    { key: "x", ctrlKey: true },
    { key: "k" },
    { key: "k", ctrlKey: true, shiftKey: true },
    { key: "k", metaKey: true, altKey: true },
    { key: "k", ctrlKey: true, repeat: true },
    { key: "k", ctrlKey: true, isComposing: true },
  ])("忽略不匹配与输入法事件 %s", (event) => {
    const action = vi.fn();
    renderHook(() => useHotkey("k", action));
    fireEvent.keyDown(window, event);
    expect(action).not.toHaveBeenCalled();
  });

  it("使用更新的回调并在卸载后清理", () => {
    const first = vi.fn();
    const next = vi.fn();
    const { rerender, unmount } = renderHook(({ action }) => useHotkey("k", action), {
      initialProps: { action: first },
    });
    rerender({ action: next });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(first).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    unmount();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(next).toHaveBeenCalledOnce();
  });
});
