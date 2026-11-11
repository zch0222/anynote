import { DEFAULT_PLACEHOLDER } from "@/components/editor/presets/types";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type EmptyBodyHintOptions = {
  /** 提示文案；缺省沿用编辑器的默认占位文案。 */
  placeholder?: string | undefined;
};

const HINT_PLUGIN_KEY = new PluginKey("anynoteEmptyBodyHint");

/**
 * 新建笔记的空态引导（UI 走查 E-06）。
 *
 * 笔记标题就是正文的首节点 H1，一篇刚创建的笔记在文档层只有那一个节点；
 * `@tiptap/extension-placeholder` 只覆盖「整篇为空」与「空段落」两种情形，
 * 于是这里既不显示占位符，也没有可写的位置提示，用户不知道正文从哪开始，
 * 也不知道可以敲 `/` 唤起命令。
 *
 * 做法是**只加视觉装饰、不改文档**：当文档恰好只有一个 H1 时，在它后面挂一个
 * widget decoration。它不进 Markdown、不触发保存、不产生"打开笔记就改写内容"的差异，
 * 用户一敲字（文档多出段落）提示就自然消失。
 */
export const EmptyBodyHint = Extension.create<EmptyBodyHintOptions>({
  name: "emptyBodyHint",

  addOptions() {
    return { placeholder: undefined };
  },

  addProseMirrorPlugins() {
    const placeholder = this.options.placeholder ?? DEFAULT_PLACEHOLDER;

    return [
      new Plugin({
        key: HINT_PLUGIN_KEY,
        props: {
          decorations: ({ doc }) => {
            if (doc.childCount !== 1 || doc.firstChild?.type.name !== "heading") {
              return null;
            }
            const hint = document.createElement("div");
            hint.className = "anynote-empty-body-hint";
            hint.textContent = placeholder;
            return DecorationSet.create(doc, [
              Decoration.widget(doc.child(0).nodeSize, hint, {
                side: 1,
                // 装饰永远不该影响光标与选择：点空白处仍按原规则落光标
                ignoreSelection: true,
              }),
            ]);
          },
        },
      }),
    ];
  },
});
