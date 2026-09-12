"use client";

import { useEffect, useState } from "react";

/**
 * 可视视口高度（M10.3 / 方案 D5 的软键盘兜底）。
 *
 * `viewport.interactiveWidget = "resizes-content"` 让浏览器在软键盘弹出时压缩布局，
 * 但 Android WebView 对它的支持并不一致：不生效时键盘会**盖住**贴底的编辑器工具条。
 *
 * 这里直接读 `visualViewport.height`——两种行为下它都是"用户真正能看到的高度"：
 * - 压缩布局：它等于收缩后的布局视口
 * - 覆盖内容：它等于视口减去键盘
 *
 * 因此外层用它当可用高度，而不是去算"键盘占了多少"（那要拿 innerHeight 做差，
 * 在压缩模式下恒为 0，等于没兜底）。不支持该 API 时返回 `null`，调用方回退到 `100svh`。
 */
export function useVisualViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const sync = () => setHeight(viewport.height);
    sync();
    viewport.addEventListener("resize", sync);
    // 键盘弹出时部分浏览器只派发 scroll（页面被顶起），不补这个会漏掉一半场景
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, []);

  return height;
}
