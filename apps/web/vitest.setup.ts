import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 未开启 globals，RTL 的自动 cleanup 不会注册，这里手动挂上，
// 避免用例之间 DOM 残留互相污染。
afterEach(() => {
  cleanup();
});

/*
 * jsdom 没有实现 scrollIntoView：Slash 菜单把高亮项滚进可视区时会调用它。
 * 不给桩的话，任何渲染这类组件的用例都会因为 `scrollIntoView is not a function`
 * 直接失败——那是 jsdom 的环境缺口，不是被测代码的问题。
 *
 * `typeof` 守卫是必需的：middleware、Route Handler 等用例跑在 node 环境，
 * 那里没有 `Element`，直接读原型会抛 `Element is not defined`。
 */
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
