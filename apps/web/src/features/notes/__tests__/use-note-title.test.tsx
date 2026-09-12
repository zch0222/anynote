import { act, renderHook } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { useNoteTitle } from "../use-note-title";

const schema = new Schema({
  nodes: {
    doc: { content: "block*" },
    paragraph: { group: "block", content: "inline*" },
    heading: { group: "block", content: "inline*", attrs: { level: { default: 1 } } },
    codeBlock: { group: "block", content: "text*" },
    blockquote: { group: "block", content: "block*" },
    text: { group: "inline" },
  },
  marks: { bold: {}, link: { attrs: { href: {} } } },
});

function editorWith(content: unknown[]): Editor {
  return { state: { doc: schema.nodeFromJSON({ type: "doc", content }) } } as Editor;
}

function heading(text: string, level = 1) {
  return {
    type: "heading",
    attrs: { level },
    content: text ? [{ type: "text", text }] : [],
  };
}

describe("useNoteTitle", () => {
  it("修改顶部 H1 时立即更新标题，并返回同一标题供正文一起保存", () => {
    const { result } = renderHook(() => useNoteTitle());
    act(() => {
      result.current.setTitle("原笔记标题");
      result.current.onEditorReady(editorWith([heading("原 H1")]));
    });
    act(() => {
      expect(result.current.getTitleForContent(editorWith([heading("新 H1")]))).toBe("新 H1");
    });
    expect(result.current.title).toBe("新 H1");
  });

  it("提取 H1 的纯文本，保留加粗、链接中的文字并去掉两端空白", () => {
    const { result } = renderHook(() => useNoteTitle());
    const editor = editorWith([
      {
        type: "heading",
        attrs: { level: 1 },
        content: [
          { type: "text", text: "  加粗", marks: [{ type: "bold" }] },
          { type: "text", text: "与链接  ", marks: [{ type: "link", attrs: { href: "/notes" } }] },
        ],
      },
    ]);
    act(() => expect(result.current.getTitleForContent(editor)).toBe("加粗与链接"));
    expect(result.current.title).toBe("加粗与链接");
  });

  it.each([
    [],
    [heading("")],
    [heading("   ")],
    [heading("二级标题", 2)],
    [{ type: "paragraph" }, heading("后面的 H1")],
    [{ type: "codeBlock", content: [{ type: "text", text: "# 代码示例" }] }],
    [{ type: "blockquote", content: [heading("引用里的 H1")] }],
  ])("空标题、非顶部 H1 和代码示例不覆盖笔记标题：%j", (...content) => {
    const { result } = renderHook(() => useNoteTitle());
    act(() => {
      result.current.setTitle("保留标题");
      expect(result.current.getTitleForContent(editorWith(content))).toBe("保留标题");
    });
    expect(result.current.title).toBe("保留标题");
  });

  it("只改正文不覆盖手动标题，随后改 H1 仍能同步", () => {
    const { result } = renderHook(() => useNoteTitle());
    act(() => {
      result.current.onEditorReady(editorWith([heading("原 H1")]));
      result.current.setTitle("手动标题");
      expect(result.current.getTitleForContent(editorWith([heading("原 H1")]))).toBe("手动标题");
      expect(result.current.getTitleForContent(editorWith([heading("新的 H1")]))).toBe("新的 H1");
    });
    expect(result.current.title).toBe("新的 H1");
  });

  it("切换笔记时重设 H1 基线，打开或只改正文不会重命名", () => {
    const { result } = renderHook(() => useNoteTitle());
    act(() => {
      result.current.onEditorReady(editorWith([heading("第一篇")]));
      result.current.setTitle("第二篇手动标题");
      result.current.onEditorReady(editorWith([heading("第二篇 H1")]));
      expect(result.current.getTitleForContent(editorWith([heading("第二篇 H1")]))).toBe(
        "第二篇手动标题",
      );
    });
    expect(result.current.title).toBe("第二篇手动标题");
  });
});
