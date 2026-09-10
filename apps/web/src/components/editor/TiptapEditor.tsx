"use client";

import type { TiptapEditorProps } from "@/components/editor/core/tiptap-editor";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";

/**
 * 对外入口：编辑器整包（TipTap + Shiki + KaTeX 桥接）走 `dynamic(..., { ssr: false })` 懒加载，
 * 保证不在首屏初始 JS 里，也避免 SSR 阶段的 DOM 依赖问题。
 */
export const TiptapEditor = dynamic(
  () => import("@/components/editor/core/tiptap-editor").then((mod) => mod.TiptapEditorImpl),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 rounded-xl border bg-card p-4" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    ),
  },
);

export type { TiptapEditorProps };
