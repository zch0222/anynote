"use client";

import { useEffect, useRef } from "react";

/**
 * Cmd / Ctrl + S：拦下浏览器的「网页另存为」，改为调用 `onSave`。
 *
 * 与 `useHotkey` 的两处差别都是为了让浏览器的另存为一次都弹不出来：
 *
 * - 长按连发的重复事件同样拦下默认动作，但只在首次按下时保存；
 * - 在 window 的**捕获阶段**监听，页面里任何组件阻止冒泡都拦不住它。
 *
 * @param onSave 按下快捷键时调用；引用可以不稳定，始终调用最新的一份
 */
export function useSaveShortcut(onSave: () => void) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "s" ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey
      )
        return;
      event.preventDefault();
      if (event.repeat) return;
      onSaveRef.current();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
