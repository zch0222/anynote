import type { Editor } from "@tiptap/core";
import type * as Y from "yjs";
import { COLLAB_INJECT_ORIGIN, COLLAB_SEEDED_KEY, collabMeta } from "./injection";

/** y-prosemirror 约定的正文片段名：TipTap 的 Collaboration 扩展默认写进这里。 */
export const COLLAB_FRAGMENT_NAME = "default";

/** 房间共享文档是否为空（以 y-prosemirror 的正文片段为准）。 */
export function isCollabDocEmpty(doc: Y.Doc): boolean {
  return doc.getXmlFragment(COLLAB_FRAGMENT_NAME).length === 0;
}

/** 置位 `meta.seeded`。放在注入之后**同一拍**执行，作为「带本地状态重连」路径的第二道锁。 */
export function markSeeded(doc: Y.Doc): void {
  doc.transact(() => {
    collabMeta(doc).set(COLLAB_SEEDED_KEY, true);
  }, COLLAB_INJECT_ORIGIN);
}

/**
 * 冷启动注入：把 REST 拿到的 Markdown 灌进空房间。
 *
 * 用 `editor.commands.setContent(..., { emitUpdate: false })` 而不是自己解析 Markdown：
 * 编辑器此刻是空的（协同模式不设初始 content），内容会经 ySyncPlugin 写进 Y.Doc，
 * 正是 y-prosemirror 文档里「首次导入既有内容」的用法。`emitUpdate: false` 让 TipTap 的
 * `onChange` 不触发，注入因此不会走保存排队（Y.Doc 层用 origin 过滤再挡一道）。
 *
 * 两道锁的分工（D4）：
 * - 主锁是「文档为空」——注入后立即非空，后来者必然跳过；
 * - `meta.seeded` 只在「客户端带着本地状态重连、本地已有内容但服务端还没有」这条路径上兜底。
 * 因此两者之间不需要严格原子，`markSeeded` 紧随其后同一拍执行即可。
 */
export function injectInitialContent(editor: Editor, markdown: string, doc: Y.Doc): void {
  editor.commands.setContent(markdown, { emitUpdate: false });
  markSeeded(doc);
}
