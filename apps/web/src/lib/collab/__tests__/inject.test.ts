import { presets } from "@/components/editor/presets";
import type { CollaborationBinding } from "@/components/editor/presets/types";
import { injectInitialContent, isCollabDocEmpty } from "@/lib/collab/inject";
import {
  COLLAB_INJECT_ORIGIN,
  COLLAB_SEEDED_KEY,
  collabMeta,
  isCollabInternalOrigin,
} from "@/lib/collab/injection";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";

/**
 * 冷启动注入的**真实**路径：真的 TipTap 编辑器 + 真的 ySyncPlugin 绑定。
 *
 * 必须用真编辑器而不是桩件。上一版的用例是自己手写
 * `doc.transact(..., COLLAB_INJECT_ORIGIN)` 再断言「这种 origin 会被过滤」——
 * 它验证的是过滤器，而真实注入压根没走那个 origin，对这个缺陷是同义反复。
 */

const MARKDOWN = "# 会议纪要\n\n第一行正文\n";

let editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
});

function collabEditor(doc: Y.Doc): Editor {
  const collaboration: CollaborationBinding = {
    doc,
    provider: { awareness: new Awareness(doc) },
    user: { name: "小明", color: "#2563eb" },
  };
  // 协同预设刻意不设 content：正文的唯一真相是 Y.Doc
  const editor = new Editor({ extensions: presets.collaborative({ collaboration }) });
  editors.push(editor);
  return editor;
}

describe("injectInitialContent", () => {
  it("把 Markdown 正文经 ySyncPlugin 写进 Y.Doc", () => {
    const doc = new Y.Doc();
    const editor = collabEditor(doc);
    expect(isCollabDocEmpty(doc)).toBe(true);

    injectInitialContent(editor, MARKDOWN, doc);

    expect(isCollabDocEmpty(doc)).toBe(false);
    expect(editor.getText()).toContain("第一行正文");
  });

  it("同一拍置位 meta.seeded", () => {
    const doc = new Y.Doc();
    injectInitialContent(collabEditor(doc), MARKDOWN, doc);
    expect(collabMeta(doc).get(COLLAB_SEEDED_KEY)).toBe(true);
  });

  /**
   * 回归（本批修复的核心）：注入产生的**每一条** Y.Doc update 都必须带 INJECT_ORIGIN。
   *
   * 从前只有 `meta.seeded` 那半拍包在事务里，正文那一半带着 ySyncPlugin 自己的
   * binding 作 origin，于是逃过 `use-collab-note` 的保存排队过滤：打开一篇没有
   * 顶部 H1 的老笔记、一个键都不敲，就会发出一次 PATCH 把它改写掉。
   */
  it("注入产生的所有 Y.Doc update 都带 INJECT_ORIGIN，一条都不漏", () => {
    const doc = new Y.Doc();
    const editor = collabEditor(doc);
    const origins: unknown[] = [];
    doc.on("update", (_update: Uint8Array, origin: unknown) => origins.push(origin));

    injectInitialContent(editor, MARKDOWN, doc);

    expect(origins.length).toBeGreaterThan(0);
    expect(origins.every((origin) => origin === COLLAB_INJECT_ORIGIN)).toBe(true);
    // 保存排队正是按这个判据过滤的，两者必须对得上
    expect(origins.every(isCollabInternalOrigin)).toBe(true);
  });

  it("注入之后的真实本地编辑不再带 INJECT_ORIGIN（否则保存会被永久过滤掉）", () => {
    const doc = new Y.Doc();
    const editor = collabEditor(doc);
    injectInitialContent(editor, MARKDOWN, doc);

    const origins: unknown[] = [];
    doc.on("update", (_update: Uint8Array, origin: unknown) => origins.push(origin));
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, "补一句");

    expect(origins.length).toBeGreaterThan(0);
    expect(origins.some(isCollabInternalOrigin)).toBe(false);
  });
});
