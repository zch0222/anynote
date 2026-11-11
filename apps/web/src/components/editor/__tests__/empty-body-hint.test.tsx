import { TiptapEditorImpl } from "@/components/editor/core/tiptap-editor";
import { DEFAULT_PLACEHOLDER } from "@/components/editor/presets/types";
import { getMarkdown } from "@anynote/editor-core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * 新建笔记的空态引导（UI 走查 E-06）。
 *
 * 笔记标题就是正文首节点 H1，新建笔记的文档只有一个 heading 节点；
 * `@tiptap/extension-placeholder` 只覆盖「整篇为空」与「空段落」，于是一片空白。
 * 现在在 H1 后面挂一个 widget decoration 提示可以写作、可以敲 `/`。
 */
describe("EmptyBodyHint", () => {
  it("文档只有一个 H1 时在标题下方给出写作引导", async () => {
    const { container } = render(
      <TiptapEditorImpl preset="full" toolbar="none" value="# 未命名笔记" />,
    );

    await waitFor(() => {
      expect(container.querySelector(".anynote-empty-body-hint")).not.toBeNull();
    });
    expect(container.querySelector(".anynote-empty-body-hint")).toHaveTextContent(
      DEFAULT_PLACEHOLDER,
    );
  });

  it("提示只是绘制层面的装饰，不改文档、不产生保存差异", async () => {
    const ready = vi.fn();
    const { container } = render(
      <TiptapEditorImpl preset="full" toolbar="none" value="# 未命名笔记" onReady={ready} />,
    );
    await waitFor(() => expect(ready).toHaveBeenCalled());

    const editor = ready.mock.calls[0]?.[0] as import("@tiptap/react").Editor;
    await waitFor(() => {
      expect(container.querySelector(".anynote-empty-body-hint")).not.toBeNull();
    });
    // 装饰不应插入段落，否则每打开一篇空笔记都会写一次"多了一个空行"
    expect(editor.state.doc.childCount).toBe(1);
    expect(getMarkdown(editor)).toBe("# 未命名笔记");
  });

  it("正文有内容时不再提示（用户已经知道怎么写了）", async () => {
    const { container } = render(
      <TiptapEditorImpl preset="full" toolbar="none" value={"# 标题\n\n正文"} />,
    );

    await waitFor(() => {
      expect(container.querySelector(".anynote-editor__content")).not.toBeNull();
    });
    expect(container.querySelector(".anynote-empty-body-hint")).toBeNull();
  });

  it("提示不挡点击：点正文仍能落到编辑器里", async () => {
    const { container } = render(
      <TiptapEditorImpl preset="full" toolbar="none" value="# 未命名笔记" />,
    );
    await waitFor(() => {
      expect(container.querySelector(".anynote-empty-body-hint")).not.toBeNull();
    });

    const hint = container.querySelector(".anynote-empty-body-hint") as HTMLElement;
    // pointer-events: none 由 CSS 负责（这里只确认它不是可聚焦节点、不吞事件）
    expect(hint.querySelector("button, a, input")).toBeNull();
    fireEvent.click(hint);
    // 点击后不抛错、编辑器仍可编辑即可；具体落点由 ProseMirror 处理
    // 提示挂在 contenteditable 内部：点它等于点正文，落光标仍由 ProseMirror 处理
    expect(container.querySelector(".anynote-editor__content")?.contains(hint)).toBe(true);
  });
});
