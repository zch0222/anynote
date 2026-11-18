import {
  type MarkdownItLike,
  type MarkdownSpecContext,
  type MdInlineState,
  escapeHtmlAttribute,
  registerMdPlugin,
} from "@anynote/editor-core";
import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

const CITATION_GROUP = /^(?:\[\d+\])+/;
const CITATION_ITEM = /\[(\d+)\]/g;
const ASCII_PREFIX = /[A-Za-z0-9_]|\[/;

type CitationInlineState = MdInlineState & {
  linkLevel: number;
  env: { references?: Record<string, unknown> };
};

function validIndex(raw: string): number | null {
  if (!/^[1-9]\d{0,2}$/.test(raw)) return null;
  const index = Number(raw);
  return index >= 1 && index <= 999 ? index : null;
}

function citationRule(state: CitationInlineState, silent: boolean): boolean {
  if (silent) return false;
  const match = CITATION_GROUP.exec(state.src.slice(state.pos, state.posMax));
  if (!match || state.linkLevel > 0) return false;

  const source = match[0];
  const previous = state.pos > 0 ? state.src[state.pos - 1] : "";
  const items = [...source.matchAll(CITATION_ITEM)];
  const first = items[0]?.[1] ?? "";
  const after = state.src[state.pos + source.length] ?? "";

  if (items.length === 1) {
    if (after === "(" || after === "[") return false;
    const references = state.env.references ?? {};
    if (Object.hasOwn(references, first.toUpperCase())) return false;
  }

  if (previous && ASCII_PREFIX.test(previous)) {
    if (!silent) state.pending += source;
    state.pos += source.length;
    return true;
  }

  if (!silent) {
    for (const item of items) {
      const raw = item[1] ?? "";
      const index = validIndex(raw);
      if (index === null) {
        state.pending += item[0];
        continue;
      }
      const token = state.push("ai_citation", "span", 0);
      token.content = item[0];
      token.meta = { index };
    }
  }
  state.pos += source.length;
  return true;
}

function citationMarkdownPlugin(md: MarkdownItLike): void {
  registerMdPlugin(md, "ai-citation", () => {
    md.inline.ruler.before("strikethrough", "ai_citation", (state, silent) =>
      citationRule(state as CitationInlineState, silent),
    );
    md.renderer.rules.ai_citation = (tokens, index) => {
      const meta = tokens[index]?.meta as { index?: number } | undefined;
      const citationIndex = meta?.index;
      if (!citationIndex) return "";
      return `<span data-ai-citation="${citationIndex}">[${escapeHtmlAttribute(String(citationIndex))}]</span>`;
    };
  });
}

/**
 * AI 回答正文中的引用编号节点。
 *
 * @author 称霸幼儿园
 */
export const AiCitation = Node.create({
  name: "aiCitation",
  inline: true,
  group: "inline",
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      index: {
        default: 1,
        parseHTML: (element: HTMLElement) => Number(element.getAttribute("data-ai-citation")),
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-ai-citation": String(attributes.index ?? ""),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-ai-citation]",
        getAttrs: (element: HTMLElement) => {
          const index = validIndex(element.getAttribute("data-ai-citation") ?? "");
          return index === null ? false : { index };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return ["span", mergeAttributes(HTMLAttributes), `[${String(node.attrs.index)}]`];
  },

  renderText({ node }) {
    return `[${String(node.attrs.index)}]`;
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          this: MarkdownSpecContext,
          state: { write(value: string): void },
          node: ProseMirrorNode,
        ) {
          state.write(`[${String(node.attrs.index)}]`);
        },
        parse: {
          setup(this: MarkdownSpecContext, md: MarkdownItLike) {
            citationMarkdownPlugin(md);
          },
        },
      },
    };
  },
});
