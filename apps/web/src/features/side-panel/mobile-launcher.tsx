"use client";

import dynamic from "next/dynamic";

/**
 * 移动端覆盖层的懒加载入口，只被 `/m/ai/chat` 引用。
 *
 * @author 称霸幼儿园
 */
export const SidePanelMobileHost = dynamic(
  () => import("./mobile/host").then((mod) => mod.SidePanelMobileHost),
  { ssr: false },
);
