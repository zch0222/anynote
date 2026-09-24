import type { Editor } from "@tiptap/core";
import type * as Y from "yjs";
import { COLLAB_INJECT_ORIGIN, COLLAB_SEEDED_KEY, collabMeta } from "./injection";

/** y-prosemirror 约定的正文片段名：TipTap 的 Collaboration 扩展默认写进这里。 */
export const COLLAB_FRAGMENT_NAME = "default";

/** 房间共享文档是否为空（以 y-prosemirror 的正文片段为准）。 */
export function isCollabDocEmpty(doc: Y.Doc): boolean {
  return doc.getXmlFragment(COLLAB_FRAGMENT_NAME).length === 0;
}

/**
 * 冷启动注入：把 REST 拿到的 Markdown 灌进空房间。
 *
 * 用 `editor.commands.setContent(..., { emitUpdate: false })` 而不是自己解析 Markdown：
 * 编辑器此刻是空的（协同模式不设初始 content），内容会经 ySyncPlugin 写进 Y.Doc，
 * 正是 y-prosemirror 文档里「首次导入既有内容」的用法。
 *
 * **整件事必须包在一个带 `COLLAB_INJECT_ORIGIN` 的事务里**（方案 D4 原文如此）。
 * ySyncPlugin 把 ProseMirror 的改动写回 Y.Doc 时用的是它自己的 binding 作 origin；
 * 不套这层外壳，正文那一半的 Y.Doc update 会**逃过 `use-collab-note` 的 origin 过滤**，
 * 被当成一次本地编辑排进保存队列——实测后果是：打开一篇没有顶部 H1 的老笔记、
 * 一个键都不敲，就会发出一次 PATCH 把它改写掉。Yjs 的事务是可嵌套的，
 * 内层 `doc.transact` 会并入外层并沿用外层 origin，所以这里套一层就够。
 *
 * 两道锁的分工（D4）：
 * - 主锁是「文档为空」——注入后立即非空，后来者必然跳过；
 * - `meta.seeded` 只在「客户端带着本地状态重连、本地已有内容但服务端还没有」这条路径上兜底。
 */
export function injectInitialContent(editor: Editor, markdown: string, doc: Y.Doc): void {
  doc.transact(() => {
    editor.commands.setContent(markdown, { emitUpdate: false });
    collabMeta(doc).set(COLLAB_SEEDED_KEY, true);
  }, COLLAB_INJECT_ORIGIN);
}
