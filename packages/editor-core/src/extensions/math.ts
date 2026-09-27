import { InputRule, Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { MarkdownSerializerState } from "prosemirror-markdown";
import { type MarkdownSpecContext, escapeHtmlAttribute } from "../markdown";
import { type MarkdownItLike, type MdBlockState, registerMdPlugin } from "../markdown-it";

/**
 * 数学公式（行内 `$latex$` / 块级 `$$latex$$`）的 schema 与 Markdown 规则。
 *
 * 节点名、属性与 parseHTML 沿用 `@tiptap/extension-mathematics` 的 `data-type` / `data-latex` 约定。
 * 渲染（KaTeX 节点视图）属于界面，由 web 在这两个定义上 `.extend()` 叠加。
 */

const INLINE_MATH = /^\$(?!\$)([^$\n]+?)\$(?!\$)/;
const BLOCK_MATH_LINE = /^\$\$(.+?)\$\$\s*$/;

function latexAttributes() {
  return {
    latex: {
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-latex") ?? "",
      renderHTML: (attributes: Record<string, unknown>) => ({
        "data-latex": String(attributes.latex ?? ""),
      }),
    },
  };
}

export const CoreInlineMath = Node.create({
  name: "inlineMath",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes: latexAttributes,

  parseHTML() {
    return [{ tag: 'span[data-type="inline-math"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "inline-math", class: "anynote-math-inline" }),
    ];
  },

  renderText({ node }) {
    return `$${String(node.attrs.latex ?? "")}$`;
  },

  addInputRules() {
    return [
      new InputRule({
        find: /(?<!\$)\$([^$\n]+?)\$(?!\$)$/,
        handler: ({ state, range, match }) => {
          const latex = (match[1] ?? "").trim();
          if (!latex) {
            return;
          }
          state.tr.replaceWith(range.from, range.to, this.type.create({ latex }));
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          this: MarkdownSpecContext,
          state: MarkdownSerializerState,
          node: ProseMirrorNode,
        ) {
          state.write(`$${String(node.attrs.latex ?? "")}$`);
        },
        parse: {
          setup(this: MarkdownSpecContext, md: MarkdownItLike) {
            mathMarkdownPlugin(md);
          },
        },
      },
    };
  },
});

export const CoreBlockMath = Node.create({
  name: "blockMath",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes: latexAttributes,

  parseHTML() {
    return [{ tag: 'div[data-type="block-math"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "block-math", class: "anynote-math-block" }),
    ];
  },

  renderText({ node }) {
    return `$$\n${String(node.attrs.latex ?? "")}\n$$`;
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$([^$\n]+?)\$\$$/,
        handler: ({ state, range, match }) => {
          const latex = (match[1] ?? "").trim();
          if (!latex) {
            return;
          }
          const $from = state.doc.resolve(range.from);
          const node = this.type.create({ latex });
          // 整段就是公式时替换整个段落，避免把块级节点塞进段落里
          const replaceWholeBlock =
            $from.depth > 0 &&
            $from.parent.isTextblock &&
            range.from === $from.start() &&
            range.to === $from.end() &&
            $from.node(-1).canReplaceWith($from.index(-1), $from.indexAfter(-1), this.type);
          const target = replaceWholeBlock
            ? { from: $from.before(), to: $from.after() }
            : { from: range.from, to: range.to };
          state.tr.replaceWith(target.from, target.to, node);
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          this: MarkdownSpecContext,
          state: MarkdownSerializerState,
          node: ProseMirrorNode,
        ) {
          state.write("$$\n");
          state.text(String(node.attrs.latex ?? ""), false);
          state.ensureNewLine();
          state.write("$$");
          state.closeBlock(node);
        },
        // 解析规则由 CoreInlineMath 统一注册在同一个 markdown-it 实例上
        parse: {},
      },
    };
  },
});

function mathBlockRule(
  state: MdBlockState,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const start = (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0);
  const max = state.eMarks[startLine] ?? 0;
  const first = state.src.slice(start, max);
  if (!first.startsWith("$$")) {
    return false;
  }
  if (silent) {
    return true;
  }

  let latex = "";
  let nextLine = startLine + 1;
  const single = BLOCK_MATH_LINE.exec(first);

  if (single?.[1]?.trim()) {
    latex = single[1].trim();
  } else {
    const parts: string[] = [];
    const rest = first.slice(2).trim();
    if (rest) {
      parts.push(rest);
    }
    let closed = false;
    while (nextLine < endLine) {
      const lineStart = (state.bMarks[nextLine] ?? 0) + (state.tShift[nextLine] ?? 0);
      const lineEnd = state.eMarks[nextLine] ?? 0;
      const line = state.src.slice(lineStart, lineEnd);
      if (line.trim() === "$$") {
        closed = true;
        nextLine += 1;
        break;
      }
      parts.push(line);
      nextLine += 1;
    }
    if (!closed) {
      return false;
    }
    latex = parts.join("\n").trim();
  }

  const token = state.push("anynote_math_block", "div", 0);
  token.content = latex;
  token.meta = { latex };
  token.map = [startLine, nextLine];
  state.line = nextLine;
  return true;
}

function mathMarkdownPlugin(md: MarkdownItLike): void {
  registerMdPlugin(md, "anynote-math", () => {
    md.inline.ruler.before("strikethrough", "anynote_math_inline", (state, silent) => {
      const rest = state.src.slice(state.pos, state.posMax);
      const match = INLINE_MATH.exec(rest);
      if (!match || match.index !== 0) {
        return false;
      }
      if (!silent) {
        const token = state.push("anynote_math_inline", "", 0);
        token.content = match[0];
        token.meta = { latex: (match[1] ?? "").trim() };
      }
      state.pos += match[0].length;
      return true;
    });

    md.renderer.rules.anynote_math_inline = (tokens, idx) => {
      const token = tokens[idx];
      const latex = (token?.meta as { latex?: string } | undefined)?.latex ?? "";
      return `<span data-type="inline-math" data-latex="${escapeHtmlAttribute(latex)}"></span>`;
    };

    md.block.ruler.before("fence", "anynote_math_block", mathBlockRule);

    md.renderer.rules.anynote_math_block = (tokens, idx) => {
      const token = tokens[idx];
      return `<div data-type="block-math" data-latex="${escapeHtmlAttribute(token?.content ?? "")}"></div>\n`;
    };
  });
}
