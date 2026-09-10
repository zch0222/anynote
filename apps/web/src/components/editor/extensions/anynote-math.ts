import { loadKatex } from "@/lib/editor/katex";
import { type MarkdownSpecContext, escapeHtmlAttribute } from "@/lib/editor/markdown";
import { type MarkdownItLike, type MdBlockState, registerMdPlugin } from "@/lib/editor/markdown-it";
import { InputRule, Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NodeView } from "@tiptap/pm/view";
import type { MarkdownSerializerState } from "prosemirror-markdown";

/**
 * 数学公式（行内 `$latex$` / 块级 `$$latex$$`）。
 *
 * 与 `@tiptap/extension-mathematics` 的差异：官方扩展在模块顶层 `import katex from "katex"`，
 * 会让约 145 KB(gzip) 的 KaTeX 无条件进入编辑器主 chunk（实测主 chunk 达 341 KB，超出 250 KB 预算）。
 * 这里自行定义同名节点（`inlineMath` / `blockMath`），attrs 与 parseHTML 沿用官方的
 * `data-type` / `data-latex` 约定，渲染改为 `loadKatex()` 动态 import，KaTeX 因此拆成独立懒加载 chunk。
 */

const INLINE_MATH = /^\$(?!\$)([^$\n]+?)\$(?!\$)/;
const BLOCK_MATH_LINE = /^\$\$(.+?)\$\$\s*$/;

/** 用 KaTeX 渲染到容器里；加载失败或不合法公式时降级为纯文本，不抛异常。 */
function renderMath(element: HTMLElement, latex: string, displayMode: boolean): void {
  element.textContent = latex;
  loadKatex()
    .then((katex) => {
      katex.render(latex, element, { displayMode, throwOnError: false });
    })
    .catch((error: unknown) => {
      console.error("KaTeX 加载失败，公式降级为纯文本", error);
    });
}

function mathNodeView(tag: "span" | "div", displayMode: boolean) {
  return ({ node }: { node: ProseMirrorNode }): NodeView => {
    const dom = document.createElement(tag);
    dom.className = displayMode ? "anynote-math-block" : "anynote-math-inline";
    dom.dataset.type = displayMode ? "block-math" : "inline-math";
    dom.setAttribute("data-latex", String(node.attrs.latex ?? ""));
    renderMath(dom, String(node.attrs.latex ?? ""), displayMode);
    return {
      dom,
      ignoreMutation: () => true,
      update: (updated) => {
        if (updated.type.name !== node.type.name) {
          return false;
        }
        dom.setAttribute("data-latex", String(updated.attrs.latex ?? ""));
        renderMath(dom, String(updated.attrs.latex ?? ""), displayMode);
        return true;
      },
    };
  };
}

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

export const AnynoteInlineMath = Node.create({
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

  addNodeView() {
    return mathNodeView("span", false);
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

export const AnynoteBlockMath = Node.create({
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

  addNodeView() {
    return mathNodeView("div", true);
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
        // 解析规则由 InlineMath 侧统一注册（同一个 markdown-it 实例），这里避免重复注册
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
