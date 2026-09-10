import type { MarkdownSpecContext } from "@/lib/editor/markdown";
import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { MarkdownSerializerState } from "prosemirror-markdown";

/**
 * `anynote-ai-block`：内嵌 AI 对话 / 补全结果的只读块，Markdown 用带 info 的 fenced code block 表达：
 *
 * ````md
 * ```anynote-ai
 * { "model": "gpt-4o-mini", "messages": [] }
 * ```
 * ````
 *
 * 结构化 payload 原样存文本，M7 接入真实 AI 流时再定义 JSON schema。
 */
export const AI_BLOCK_FENCE = "anynote-ai";

export const AnynoteAiBlock = Node.create({
  name: "aiBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      payload: {
        default: "",
        parseHTML: (element) => element.textContent ?? "",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-ai-block]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-ai-block": "", class: "anynote-ai-block" }),
      String(node.attrs.payload ?? ""),
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
          state.write(`\`\`\`${AI_BLOCK_FENCE}\n`);
          state.text(String(node.attrs.payload ?? ""), false);
          state.ensureNewLine();
          state.write("```");
          state.closeBlock(node);
        },
        parse: {
          // 交给 markdown-it 的 fence 渲染成 <pre><code class="language-anynote-ai">，这里把它换成 aiBlock 节点
          updateDOM(this: MarkdownSpecContext, element: HTMLElement) {
            const codes = element.querySelectorAll("pre > code");
            for (const code of Array.from(codes)) {
              const className = code.getAttribute("class") ?? "";
              if (!className.includes(`language-${AI_BLOCK_FENCE}`)) {
                continue;
              }
              const pre = code.parentElement;
              const doc = element.ownerDocument;
              if (!pre || !doc) {
                continue;
              }
              const block = doc.createElement("div");
              block.setAttribute("data-ai-block", "");
              block.textContent = code.textContent ?? "";
              pre.replaceWith(block);
            }
          },
        },
      },
    };
  },
});
