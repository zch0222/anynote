import { type MarkdownSpecContext, escapeHtmlAttribute } from "@/lib/editor/markdown";
import { type MarkdownItLike, type MdToken, addInlineAtom } from "@/lib/editor/markdown-it";
import { Node, mergeAttributes, nodeInputRule } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { MarkdownSerializerState } from "prosemirror-markdown";

/**
 * `anynote-wikilink`：内部双链 `[[笔记名]]` / `[[笔记名|显示文本]]`。
 * 行内原子节点，Markdown 就是它本身的语法，因此 round-trip 无损。
 */

const WIKILINK_PATTERN = /^\[\[([^\]\n]+?)\]\]/;
const INPUT_PATTERN = /\[\[([^\]\n]+?)\]\]$/;

function splitTarget(raw: string): { target: string; label: string | null } {
  const separator = raw.indexOf("|");
  if (separator < 0) {
    return { target: raw.trim(), label: null };
  }
  return {
    target: raw.slice(0, separator).trim(),
    label: raw.slice(separator + 1).trim() || null,
  };
}

function wikilinkMarkdownPlugin(md: MarkdownItLike): void {
  addInlineAtom(md, "anynote_wikilink", WIKILINK_PATTERN, (token: MdToken) => {
    const text = (token.meta as { text?: string } | undefined)?.text ?? "";
    const { target, label } = splitTarget(text);
    const labelAttr = label ? ` data-label="${escapeHtmlAttribute(label)}"` : "";
    return `<span data-wikilink="${escapeHtmlAttribute(target)}"${labelAttr}></span>`;
  });
}

export const AnynoteWikilink = Node.create({
  name: "wikilink",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      target: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-wikilink") ?? "",
        renderHTML: (attributes) => ({ "data-wikilink": String(attributes.target ?? "") }),
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-label"),
        renderHTML: (attributes) =>
          attributes.label ? { "data-label": String(attributes.label) } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-wikilink]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const label = HTMLAttributes["data-label"];
    const target = String(HTMLAttributes["data-wikilink"] ?? "");
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "anynote-wikilink", "data-wikilink": target }),
      label ? String(label) : target,
    ];
  },

  renderText({ node }) {
    return `[[${String(node.attrs.target ?? "")}]]`;
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: INPUT_PATTERN,
        type: this.type,
        getAttributes: (match) => splitTarget(match[1] ?? ""),
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
          const target = String(node.attrs.target ?? "");
          const label = node.attrs.label ? String(node.attrs.label) : null;
          state.write(label ? `[[${target}|${label}]]` : `[[${target}]]`);
        },
        parse: {
          setup(this: MarkdownSpecContext, md: MarkdownItLike) {
            wikilinkMarkdownPlugin(md);
          },
        },
      },
    };
  },
});
