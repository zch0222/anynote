"use client";

import type { TiptapEditorProps } from "@/components/editor/core/tiptap-editor";
import { PanelSkeleton } from "@/components/loading/skeletons";
import dynamic from "next/dynamic";

/**
 * 对外入口：编辑器整包（TipTap + Shiki + KaTeX 桥接）走 `dynamic(..., { ssr: false })` 懒加载，
 * 保证不在首屏初始 JS 里，也避免 SSR 阶段的 DOM 依赖问题。
 */
export const TiptapEditor = dynamic(
  () => import("@/components/editor/core/tiptap-editor").then((mod) => mod.TiptapEditorImpl),
  {
    ssr: false,
    loading: () => <PanelSkeleton />,
  },
);

export type { TiptapEditorProps };
