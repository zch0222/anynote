"use client";

import { SUPPORTED_LANGUAGES, highlightToHtml } from "@/lib/editor/shiki";
import { cn } from "@/lib/utils";
import CodeBlock from "@tiptap/extension-code-block";
import {
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

/**
 * `code-block-shiki`：在 NodeView 里调用 Shiki 单例做高亮。
 *
 * 实现采用「高亮层 + 可编辑层叠加」：
 * - 高亮结果绝对定位铺满，`pointer-events: none`；
 * - 真正可编辑的 `<pre>` 文字透明、只保留光标，叠在高亮层之上。
 * 这样无需切换 focus 态即可边写边看高亮，也不会破坏 ProseMirror 的光标 / 选区。
 */
function CodeBlockShikiView({ node, updateAttributes }: NodeViewProps) {
  const code = node.textContent;
  const language = typeof node.attrs.language === "string" ? node.attrs.language : "";
  const [html, setHtml] = useState("");
  const latest = useRef(0);

  useEffect(() => {
    const token = latest.current + 1;
    latest.current = token;
    let cancelled = false;
    highlightToHtml(code, language)
      .then((result) => {
        if (!cancelled && latest.current === token) {
          setHtml(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Shiki 高亮失败", error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <NodeViewWrapper className="anynote-code-block" data-language={language || "text"}>
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
      <div className="anynote-code-block__body">
        {html ? (
          // Shiki 输出的是转义后的代码，作为装饰层只读渲染
          <div
            aria-hidden="true"
            className="anynote-code-block__preview"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: 内容来自 Shiki 转义输出
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : null}
        <NodeViewContent<"pre">
          as="pre"
          className={cn("anynote-code-block__editor", html && "is-highlighted")}
        />
      </div>
    </NodeViewWrapper>
  );
}

export const CodeBlockShiki = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockShikiView);
  },
});
