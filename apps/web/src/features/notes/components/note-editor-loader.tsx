"use client";

import { EditorSkeleton } from "@/components/loading/skeletons";
import dynamic from "next/dynamic";

/**
 * 笔记编辑器的懒加载入口（桌面）。
 *
 * 为什么必须懒加载：笔记编辑器及其依赖链（`use-collab-note` → `@/lib/collab/session`
 * → yjs / y-websocket / y-prosemirror，以及编辑器自身的 TipTap 桥接）都是重依赖。
 * 路由文件直接静态引入，webpack 会把这些并进 `/notes/[baseId]/[noteId]` 的首屏图——
 * 实测 +140KB 以上，直接顶爆 310KB 预算（仓库禁止清单：重依赖一律
 * `dynamic(..., { ssr: false })`）。
 *
 * 加载态给编辑器骨架：它与即将出现的正文同形，加载完不会整块跳。
 * 与页面里原本「`initialContent === null` 时渲染 EditorSkeleton」的行为一致。
 */
export const NoteEditor = dynamic<{ baseId: number; noteId: number }>(
  () => import("./note-editor").then((mod) => mod.NoteEditor),
  { ssr: false, loading: () => <EditorSkeleton /> },
);
