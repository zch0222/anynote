import CodeBlock from "@tiptap/extension-code-block";

/**
 * 代码块的 schema。Markdown 的 fenced code block 由 `tiptap-markdown` 内置规则处理。
 * 语言下拉与 Shiki 高亮属于界面，由 web 在这个定义上 `.extend()` 叠加。
 */
export const CoreCodeBlock = CodeBlock;
