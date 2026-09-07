import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 未开启 globals，RTL 的自动 cleanup 不会注册，这里手动挂上，
// 避免用例之间 DOM 残留互相污染。
afterEach(() => {
  cleanup();
});
