import Image from "@tiptap/extension-image";

/**
 * 图片的 schema。Markdown 沿用 `tiptap-markdown` 内置的 `![alt](src)` 规则。
 * 粘贴 / 拖拽上传属于界面，由 web 在这个定义上 `.extend()` 叠加。
 */
export const CoreImage = Image;
