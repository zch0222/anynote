"use client";

import type { ProcessResultItem } from "@/lib/ai/process";
import type { CitationLike } from "@/lib/ai/resource-target";
import { createContext, useContext } from "react";

/**
 * 侧栏链接上下文：宿主页面提供打开资源的入口，没有宿主的页面拿到空值。
 *
 * 首屏只传原始引用或工具条目，资源目标由懒加载宿主解析，避免解析逻辑进入首屏。
 *
 * @author 称霸幼儿园
 */

export type SidePanelOpenInput =
  | { kind: "citation"; citation: CitationLike }
  | { kind: "tool"; entry: ProcessResultItem };

export type SidePanelOpenOptions = { focus?: boolean };

export type SidePanelLinkHandler = (
  input: SidePanelOpenInput,
  options?: SidePanelOpenOptions,
) => void;

export const SidePanelLinkContext = createContext<SidePanelLinkHandler | null>(null);

/** 读取当前页面的侧栏打开入口。 */
export function useSidePanelLink(): SidePanelLinkHandler | null {
  return useContext(SidePanelLinkContext);
}

/**
 * 判断一次点击是否应交给侧栏：只有不带修饰键的左键单击。
 *
 * @param event 鼠标事件的可判定字段
 * @returns 需要侧栏接管时为真
 */
export function shouldHandleSidePanelClick(event: {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
}
