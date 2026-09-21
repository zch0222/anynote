"use client";

import { EditorSkeleton } from "@/components/loading/skeletons";
import dynamic from "next/dynamic";

/**
 * 笔记编辑器的懒加载入口（移动端）。
 *
 * 与桌面同一处理，并且是方案 D10「`/m/*` 预算超限时把协同运行时做成动态分包」
 * 的落地：移动端路由额度最紧（250KB），编辑器与其协同依赖链不能进首屏图。
 * 加载态给编辑器骨架，避免加载完整块跳动。
 */
export const MobileNoteEditor = dynamic<{ baseId: number; noteId: number }>(
  () => import("./note-editor-mobile").then((mod) => mod.MobileNoteEditor),
  { ssr: false, loading: () => <EditorSkeleton /> },
);
