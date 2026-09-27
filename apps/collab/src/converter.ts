import { createHash } from "node:crypto";
import {
  EDITOR_SCHEMA_VERSION,
  coreExtensions,
  ensureLeadingHeading,
  getMarkdown,
  leadingHeadingOf,
} from "@anynote/editor-core";
import { Editor, type JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import {
  prosemirrorJSONToYXmlFragment,
  updateYFragment,
  yXmlFragmentToProsemirrorJSON,
} from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { installDom } from "./dom.ts";

/** Y.Doc 里正文片段的名字，与前端 Collaboration 扩展的默认值一致；改名即破坏已有状态。 */
export const FRAGMENT = "default";

/** 转换结果：正文 Markdown 与从顶部 H1 取出的标题（没有 H1 或为空时为 null）。 */
export type SerializedNote = { markdown: string; title: string | null };

export type Converter = ReturnType<typeof createConverter>;

/**
 * 由笔记 id、版本号与编辑器版本确定的谱系与 clientID。
 *
 * 从 Markdown 全新构建状态时用它们：同一篇笔记、同一个版本重复构建得到逐字节相同的状态，
 * 之前持有该构建副本的客户端重连时不会被判为不同谱系，也不会因条目不同而重复正文。
 */
export function deterministicLineage(
  noteId: number,
  version: string,
): { epoch: string; clientId: number } {
  const digest = sha256Hex(`${noteId}:${version}:${EDITOR_SCHEMA_VERSION}`);
  const epoch = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  // clientID 取 1 ~ 2^31-1，避开 0 与客户端常见的随机区间边界
  const clientId = (Number.parseInt(digest.slice(32, 40), 16) % 0x7ffffffe) + 1;
  return { epoch, clientId };
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Markdown 与 Y.Doc 之间的转换器：一个无界面 TipTap 编辑器 + `@anynote/editor-core` 的扩展。
 *
 * TipTap 命令同步执行，单线程下不会交错，整个进程共用一个实例。
 * 转换失败（例如遇到 schema 不认识的节点）直接抛错，调用方不得写入残缺内容。
 */
export function createConverter() {
  installDom();
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: coreExtensions({ undoRedo: false }),
  });

  /** Markdown → ProseMirror 文档，走与浏览器相同的 tiptap-markdown 解析。 */
  function parse(markdown: string): PMNode {
    editor.commands.setContent(markdown, { emitUpdate: false });
    return editor.state.doc;
  }

  return {
    /**
     * 从 Markdown 全新构建一份 Y 状态。
     *
     * @param markdown 正文（已补顶部 H1）
     * @param clientId 构建用的 clientID，传入确定值时构建结果可重复
     * @returns `Y.encodeStateAsUpdate` 的全量状态
     */
    buildState(markdown: string, clientId?: number): Uint8Array {
      const doc = new Y.Doc({ gc: true });
      if (clientId !== undefined) doc.clientID = clientId;
      prosemirrorJSONToYXmlFragment(
        editor.schema,
        parse(markdown).toJSON(),
        doc.getXmlFragment(FRAGMENT),
      );
      const state = Y.encodeStateAsUpdate(doc);
      doc.destroy();
      return state;
    },

    /**
     * 把 doc 按差异更新成 markdown 表示的内容，未改动部分保留原有的 Yjs 条目。
     * 调用方负责用 `doc.transact(..., origin)` 包裹以标记来源。
     */
    applyMarkdown(doc: Y.Doc, markdown: string): void {
      updateYFragment(doc, doc.getXmlFragment(FRAGMENT), parse(markdown), {
        mapping: new Map(),
        isOMark: new Map(),
      });
    },

    /** Y.Doc → Markdown 与标题；标题截断到 80 字，顶部 H1 为空时为 null。 */
    serialize(doc: Y.Doc): SerializedNote {
      const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(FRAGMENT)) as JSONContent;
      editor.commands.setContent(json, { emitUpdate: false });
      return { markdown: getMarkdown(editor), title: leadingHeadingOf(editor.state.doc) };
    },

    /** 与前端打开笔记时相同的规范化：正文不以 H1 开头时用标题补上。 */
    normalize(markdown: string, title: string | null): string {
      return ensureLeadingHeading(markdown, title);
    },

    destroy(): void {
      editor.destroy();
    },
  };
}
