import type { Editor } from "@tiptap/core";
import { Markdown } from "tiptap-markdown";

/** 自定义节点 / mark 的 markdown 规则上下文（`tiptap-markdown` 会以 `this` 注入）。 */
export type MarkdownSpecContext<O = Record<string, unknown>> = {
  editor: Editor;
  options: O;
};

/**
 * Markdown 双向序列化的基础扩展（基于 `tiptap-markdown`）。
 *
 * - `html: false`：禁止裸 HTML 进出，避免 XSS，也让自定义节点必须显式声明序列化规则。
 * - 自定义节点 / mark 通过在各自扩展里返回 `addStorage().markdown` 注册 `serialize` 与 `parse`。
 *
 * 已知限制（写入文档，避免误判为 bug）：
 * - `textAlign` 是节点属性，Markdown 无对应语法，序列化时会丢失（编辑期保留，持久化丢失）。
 * - `Color` / `TextStyle` 未启用（需先定好 Markdown 表达方式），颜色能力后置到 M6。
 */
export const MarkdownBridge = Markdown.configure({
  html: false,
  tightLists: true,
  bulletListMarker: "-",
  linkify: true,
  breaks: false,
  transformPastedText: true,
  transformCopiedText: true,
});

/** 读取编辑器当前 Markdown。 */
export function getMarkdown(editor: { storage: unknown }): string {
  const storage = editor.storage as { markdown?: { getMarkdown?: () => string } };
  return storage.markdown?.getMarkdown?.() ?? "";
}

/** 转义 markdown-it 自定义 renderer 里要写进 HTML 属性的值。 */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
