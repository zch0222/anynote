import type { MarkdownSpecContext } from "@/lib/editor/markdown";
import {
  type MarkdownItLike,
  type MdCoreState,
  type MdToken,
  registerMdPlugin,
} from "@/lib/editor/markdown-it";
import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { MarkdownSerializerState } from "prosemirror-markdown";

/** Callout 支持的语气级别，与 `> [!INFO]` 一类标记一一对应。 */
export const CALLOUT_LEVELS = ["info", "tip", "warn", "danger"] as const;
export type CalloutLevel = (typeof CALLOUT_LEVELS)[number];

const DEFAULT_LEVEL: CalloutLevel = "info";
const MARKER = /^\[!(\w+)\]\s*/;

function isCalloutLevel(value: string): value is CalloutLevel {
  return (CALLOUT_LEVELS as readonly string[]).includes(value);
}

/** 把 `[!INFO]` 标记从 inline token 的 content 与 children 里摘掉。 */
function stripMarker(inline: MdToken, length: number): void {
  inline.content = inline.content.slice(length);
  let remaining = length;
  const children = inline.children ?? [];
  while (remaining > 0 && children.length > 0) {
    const child = children[0] as MdToken;
    const text = child.content ?? "";
    if (text.length <= remaining) {
      remaining -= text.length;
      children.shift();
    } else {
      child.content = text.slice(remaining);
      remaining = 0;
    }
  }
}

/**
 * Obsidian 风格 `> [!INFO]` → `<blockquote data-callout="info">`。
 * 解析发生在 markdown-it 的核心阶段（inline 之后），这样标记已被拆成文本 token，便于精确裁剪。
 */
function calloutMarkdownPlugin(md: MarkdownItLike): void {
  registerMdPlugin(md, "anynote-callout", () => {
    md.core.ruler.after("inline", "anynote_callout", (state: MdCoreState) => {
      const tokens = state.tokens;
      for (let i = 0; i < tokens.length; i += 1) {
        const open = tokens[i];
        if (!open || open.type !== "blockquote_open") {
          continue;
        }
        const paragraph = tokens[i + 1];
        const inline = tokens[i + 2];
        if (
          !paragraph ||
          paragraph.type !== "paragraph_open" ||
          !inline ||
          inline.type !== "inline"
        ) {
          continue;
        }
        const match = MARKER.exec(inline.content);
        if (!match) {
          continue;
        }
        const level = String(match[1]).toLowerCase();
        if (!isCalloutLevel(level)) {
          continue;
        }
        open.attrSet("data-callout", level);
        stripMarker(inline, match[0].length);
      }
    });
  });
}

/**
 * `anynote-callout`：带语气级别的引用块。
 * 节点名保持 `callout`，HTML 用 `blockquote[data-callout]`，与普通引用（blockquote）互不干扰。
 */
export const AnynoteCallout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      level: {
        default: DEFAULT_LEVEL,
        parseHTML: (element) => element.getAttribute("data-callout") ?? DEFAULT_LEVEL,
        renderHTML: (attributes) => ({ "data-callout": String(attributes.level ?? DEFAULT_LEVEL) }),
      },
    };
  },

  parseHTML() {
    // 优先级高于 StarterKit 的 blockquote，确保带 data-callout 的引用块归 callout 解析
    return [{ tag: "blockquote[data-callout]", priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["blockquote", mergeAttributes(HTMLAttributes, { class: "anynote-callout" }), 0];
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          this: MarkdownSpecContext,
          state: MarkdownSerializerState,
          node: ProseMirrorNode,
        ) {
          const level = String(node.attrs.level ?? DEFAULT_LEVEL).toUpperCase();
          state.wrapBlock("> ", `> [!${level}] `, node, () => state.renderContent(node));
        },
        parse: {
          setup(this: MarkdownSpecContext, md: MarkdownItLike) {
            calloutMarkdownPlugin(md);
          },
        },
      },
    };
  },
});
