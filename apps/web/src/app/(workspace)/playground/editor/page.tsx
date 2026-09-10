import { notFound } from "next/navigation";
import { EditorPlayground } from "./editor-playground";

/** 编辑器演示页：仅开发环境暴露，生产构建直接 404。 */
export default function EditorPlaygroundPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return (
    <>
      {/* KaTeX 关键字重，首屏预加载最常用的几支，避免公式跳动 */}
      <link
        rel="preload"
        as="font"
        type="font/woff2"
        href="/fonts/katex/KaTeX_Main-Regular.woff2"
        crossOrigin="anonymous"
      />
      <link
        rel="preload"
        as="font"
        type="font/woff2"
        href="/fonts/katex/KaTeX_Main-Bold.woff2"
        crossOrigin="anonymous"
      />
      <link
        rel="preload"
        as="font"
        type="font/woff2"
        href="/fonts/katex/KaTeX_Math-Italic.woff2"
        crossOrigin="anonymous"
      />
      <link
        rel="preload"
        as="font"
        type="font/woff2"
        href="/fonts/katex/KaTeX_Size1-Regular.woff2"
        crossOrigin="anonymous"
      />
      <EditorPlayground />
    </>
  );
}
