import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSaveShortcut } from "../use-save-shortcut";

/** 在 window 上派发一次 keydown，返回事件以便断言是否拦下了浏览器默认动作。 */
function press(init: KeyboardEventInit, target: EventTarget = window) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("useSaveShortcut", () => {
  it.each([{ ctrlKey: true }, { metaKey: true }])(
    "Cmd / Ctrl + S 触发保存，并拦下浏览器的「网页另存为」 %s",
    (modifier) => {
      const onSave = vi.fn();
      renderHook(() => useSaveShortcut(onSave));

      const event = press({ key: "s", ...modifier });

      expect(onSave).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(true);
    },
  );

  it("大写锁定时（key 为 S）同样生效", () => {
    const onSave = vi.fn();
    renderHook(() => useSaveShortcut(onSave));

    expect(press({ key: "S", ctrlKey: true }).defaultPrevented).toBe(true);
    expect(onSave).toHaveBeenCalledOnce();
  });

  /*
   * 按住不放时浏览器会连发 keydown。只拦首次的话，后续的重复事件照样弹出另存为；
   * 但每次重复都保存一遍也没有意义，所以重复事件只拦不存。
   */
  it("长按连发：重复事件只拦下默认动作，不重复保存", () => {
    const onSave = vi.fn();
    renderHook(() => useSaveShortcut(onSave));

    press({ key: "s", ctrlKey: true });
    const repeated = press({ key: "s", ctrlKey: true, repeat: true });

    expect(repeated.defaultPrevented).toBe(true);
    expect(onSave).toHaveBeenCalledOnce();
  });

  it.each([
    { key: "s" },
    { key: "a", ctrlKey: true },
    { key: "s", ctrlKey: true, shiftKey: true },
    { key: "s", metaKey: true, altKey: true },
  ])("其它按键与组合不拦截 %s", (init) => {
    const onSave = vi.fn();
    renderHook(() => useSaveShortcut(onSave));

    const event = press(init);

    expect(onSave).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  /*
   * 在捕获阶段监听：页面里任何组件在冒泡阶段 stopPropagation，
   * 冒泡阶段的 window 监听就收不到，浏览器的另存为又会弹出来。
   */
  it("内层元素阻止冒泡也照样拦下", () => {
    const onSave = vi.fn();
    renderHook(() => useSaveShortcut(onSave));
    const inner = document.createElement("div");
    document.body.append(inner);
    inner.addEventListener("keydown", (event) => event.stopPropagation());

    const event = press({ key: "s", ctrlKey: true }, inner);

    expect(event.defaultPrevented).toBe(true);
    expect(onSave).toHaveBeenCalledOnce();
    inner.remove();
  });

  it("使用最新的回调，卸载后不再拦截", () => {
    const first = vi.fn();
    const next = vi.fn();
    const { rerender, unmount } = renderHook(({ onSave }) => useSaveShortcut(onSave), {
      initialProps: { onSave: first },
    });

    rerender({ onSave: next });
    press({ key: "s", ctrlKey: true });
    expect(first).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();

    unmount();
    const afterUnmount = press({ key: "s", ctrlKey: true });
    expect(afterUnmount.defaultPrevented).toBe(false);
    expect(next).toHaveBeenCalledOnce();
  });
});
