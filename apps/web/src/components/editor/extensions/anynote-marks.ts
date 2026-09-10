import type { MarkdownSpecContext } from "@/lib/editor/markdown";
import { addInlineWrapper } from "@/lib/editor/markdown-it";
import type { MarkdownItLike } from "@/lib/editor/markdown-it";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";

/**
 * Markdown 没有下划线与高亮的原生语法，这里固定一套约定并与解析端成对实现，保证 round-trip：
 * - 高亮 `highlight`  ↔ `==文本==`（Obsidian / 社区常用）
 * - 下划线 `underline` ↔ `++文本++`
 *
 * 已知限制：`highlight` 的颜色属性不写进 Markdown（语义保留、颜色丢失）。颜色若要持久化，
 * 需要 M6 再定义（例如 `=={color}文本==`），本期不做。
 */

export const AnynoteHighlight = Highlight.extend({
  addStorage() {
    return {
      markdown: {
        serialize: { open: "==", close: "==" },
        parse: {
          setup(this: MarkdownSpecContext, md: MarkdownItLike) {
            addInlineWrapper(md, "anynote_highlight", /^==([^=\n]+?)==/, "mark");
          },
        },
      },
    };
  },
}).configure({ multicolor: true });

export const AnynoteUnderline = Underline.extend({
  addStorage() {
    return {
      markdown: {
        serialize: { open: "++", close: "++" },
        parse: {
          setup(this: MarkdownSpecContext, md: MarkdownItLike) {
            addInlineWrapper(md, "anynote_underline", /^\+\+([^+\n]+?)\+\+/, "u");
          },
        },
      },
    };
  },
});
