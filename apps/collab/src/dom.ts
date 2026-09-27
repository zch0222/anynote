import { JSDOM } from "jsdom";

/** ProseMirror 与 tiptap-markdown 在无界面环境下用到的浏览器全局对象。 */
const DOM_GLOBALS = [
  "window",
  "document",
  "navigator",
  "DOMParser",
  "Node",
  "Element",
  "HTMLElement",
  "Text",
  "DocumentFragment",
  "MutationObserver",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
] as const;

let installed = false;

/**
 * 在进程级安装一份 jsdom 的 `window` 与相关全局对象，供无界面编辑器使用。
 *
 * 只安装一次；已经存在的全局对象（例如 Node 自带的 `navigator`）用 jsdom 的实现覆盖，
 * 保证 Markdown 解析走与浏览器端单测相同的 DOM 实现。
 */
export function installDom(): void {
  if (installed) return;
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const window = dom.window as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    const value = key === "window" ? dom.window : window[key];
    Object.defineProperty(globalThis, key, {
      value: typeof value === "function" && key !== "window" ? (value as object) : value,
      configurable: true,
      writable: true,
    });
  }
  installed = true;
}
