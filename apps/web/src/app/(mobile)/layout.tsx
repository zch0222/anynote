import { MobileShell } from "@/components/layout/mobile/mobile-shell";
import "@/styles/mobile.css";
import type { Viewport } from "next";
import type { ReactNode } from "react";

/**
 * 移动端路由段（方案 D1 / D2）。
 *
 * `interactiveWidget: "resizes-content"`：软键盘弹出时压缩布局高度而不是盖住内容——
 * 编辑器的贴底工具条依赖这个行为。Android WebView 对该字段支持不一致，
 * M10.3 会在 shell 里补一层 VisualViewport 兜底。
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 允许缩放：禁掉 user-scalable 会直接踩 Lighthouse 无障碍门槛（门槛 0.95）
  maximumScale: 5,
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function MobileLayout({ children }: { children: ReactNode }) {
  return <MobileShell>{children}</MobileShell>;
}
