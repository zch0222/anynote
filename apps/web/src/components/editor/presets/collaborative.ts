import { full } from "@/components/editor/presets/full";
import type { PresetContext } from "@/components/editor/presets/types";
import type { Extensions } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";

/**
 * `collaborative`：`full` 的多人版。两处关键差异——
 *
 * 1. 关掉 StarterKit 自带的 undo/redo：本地历史栈会把别人的编辑一起撤销掉，
 *    必须换成 Collaboration 基于 Y.UndoManager 的版本（命令名不变，工具栏无需改）。
 * 2. 不设初始 content：正文的唯一真相是 Y.Doc，由 ySyncPlugin 灌进编辑器。
 *    在此之外再 setContent 会把内容重复写一遍。
 *
 * 没传 collaboration 绑定时退回 `full`，让「连接中」这类中间态也能正常渲染。
 */
export function collaborative(ctx: PresetContext): Extensions {
  const binding = ctx.collaboration;
  if (!binding) return full(ctx);

  return [
    ...full({ ...ctx, undoRedo: false }),
    Collaboration.configure({ document: binding.doc }),
    CollaborationCaret.configure({ provider: binding.provider, user: binding.user }),
  ];
}
