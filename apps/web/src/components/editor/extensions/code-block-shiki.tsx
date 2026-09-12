"use client";

import { SUPPORTED_LANGUAGES, prepareHighlight, tokenize } from "@/lib/editor/shiki";
import CodeBlock from "@tiptap/extension-code-block";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";

/** 装饰 `<span>` 上的类名；`tiptap.css` 据此按明暗主题取 `--shiki-light` / `--shiki-dark`。 */
export const CODE_TOKEN_CLASS = "anynote-code-token";

export const codeBlockShikiKey = new PluginKey<ShikiPluginState>("anynote-code-block-shiki");

type ShikiPluginState = {
  decorations: DecorationSet;
  /** 本次分词时还没就绪的语言，插件 view 负责把它们加载起来再重画。 */
  pending: readonly string[];
};

/**
 * 遍历文档里的代码块，把 Shiki 的分词结果贴成行内装饰。
 *
 * 装饰直接落在**真正的正文文本**上，因此不存在「高亮层与可编辑层对不齐」的问题：
 * 换行、缩进、自动折行都只有一份布局。
 */
export function buildShikiDecorations(doc: ProseMirrorNode, nodeName: string): ShikiPluginState {
  const decorations: Decoration[] = [];
  const pending = new Set<string>();

  doc.descendants((node, pos) => {
    if (node.type.name !== nodeName) {
      // 代码块不会嵌套代码块，进到别的块里继续找
      return true;
    }
    const language = typeof node.attrs.language === "string" ? node.attrs.language : "";
    const tokens = tokenize(node.textContent, language);
    if (tokens === null) {
      pending.add(language);
      return false;
    }
    // 块内第一个字符的位置：块起点 + 1
    const start = pos + 1;
    for (const token of tokens) {
      decorations.push(
        Decoration.inline(start + token.offset, start + token.offset + token.length, {
          class: CODE_TOKEN_CLASS,
          style: token.style,
        }),
      );
    }
    return false;
  });

  return { decorations: DecorationSet.create(doc, decorations), pending: [...pending] };
}

function createShikiPlugin(nodeName: string) {
  return new Plugin<ShikiPluginState>({
    key: codeBlockShikiKey,
    state: {
      init: (_config, state) => buildShikiDecorations(state.doc, nodeName),
      apply: (tr, previous, _oldState, newState) =>
        // 文档没变、也没有「语法刚加载好」的信号时复用上一次结果，避免每次选区变化都重新分词
        tr.docChanged || tr.getMeta(codeBlockShikiKey)
          ? buildShikiDecorations(newState.doc, nodeName)
          : previous,
    },
    props: {
      decorations: (state) => codeBlockShikiKey.getState(state)?.decorations,
    },
    view: (view) => {
      let destroyed = false;
      // 同一种语言只发一次加载请求：`update` 每拍都会跑，不去重会堆出大量 Promise
      const requested = new Set<string>();

      const load = (languages: readonly string[]) => {
        for (const language of languages) {
          if (requested.has(language)) continue;
          requested.add(language);
          void prepareHighlight(language)
            .then((changed) => {
              if (destroyed || !changed) return;
              view.dispatch(view.state.tr.setMeta(codeBlockShikiKey, true));
            })
            .catch((error) => {
              // 语法包下载失败只影响高亮，代码块本身照常可编辑
              console.error("Shiki 语法加载失败", error);
            });
        }
      };

      load(codeBlockShikiKey.getState(view.state)?.pending ?? []);
      return {
        update: (updated) => load(codeBlockShikiKey.getState(updated.state)?.pending ?? []),
        destroy: () => {
          destroyed = true;
        },
      };
    },
  });
}

/**
 * 代码块 NodeView：只负责语言下拉框，正文交给 ProseMirror 原样渲染。
 *
 * 不要在这里做高亮——高亮走上面的装饰插件。NodeView 里另起一层高亮 DOM
 * 必然要和可编辑层做像素级对齐，字体、折行、tab 宽度任何一项不一致都会错位。
 */
function CodeBlockShikiView({ node, updateAttributes, editor }: NodeViewProps) {
  const language = typeof node.attrs.language === "string" ? node.attrs.language : "";

  return (
    <NodeViewWrapper className="anynote-code-block" data-language={language || "text"}>
      {editor.isEditable ? (
        <div className="anynote-code-block__toolbar" contentEditable={false}>
          <select
            aria-label="代码语言"
            className="anynote-code-block__language"
            value={language}
            onChange={(event) => updateAttributes({ language: event.target.value || null })}
          >
            <option value="">纯文本</option>
            {SUPPORTED_LANGUAGES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <NodeViewContent<"pre"> as="pre" className="anynote-code-block__editor" />
    </NodeViewWrapper>
  );
}

export const CodeBlockShiki = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockShikiView);
  },

  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), createShikiPlugin(this.name)];
  },
});
