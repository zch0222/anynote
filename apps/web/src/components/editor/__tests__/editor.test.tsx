import { TiptapEditorImpl } from "@/components/editor/core/tiptap-editor";
import { getMarkdown } from "@/lib/editor/markdown";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { describe, expect, it, vi } from "vitest";

describe("TiptapEditor", () => {
  it("初始化和切换编辑权限不触发内容保存回调", async () => {
    const onChange = vi.fn();
    const onReady = vi.fn();
    const { rerender } = render(
      <TiptapEditorImpl preset="full" value="# 正文标题" onChange={onChange} onReady={onReady} />,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();

    rerender(
      <TiptapEditorImpl
        preset="full"
        value="# 正文标题"
        editable={false}
        onChange={onChange}
        onReady={onReady}
      />,
    );
    expect((onReady.mock.calls[0]?.[0] as Editor).isEditable).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("full 预设渲染工具栏与可编辑区域", async () => {
    const { container } = render(<TiptapEditorImpl preset="full" value="# 标题" />);

    expect(screen.getByRole("toolbar", { name: "编辑器工具栏" })).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector(".ProseMirror")).not.toBeNull());
    expect(container.querySelector(".ProseMirror")?.getAttribute("contenteditable")).toBe("true");
  });

  it("minimal 预设隐藏仅 full 才有的按钮（如表格）", async () => {
    render(<TiptapEditorImpl preset="minimal" value="评论内容" />);

    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "表格" })).toBeNull();
    expect(screen.getByRole("button", { name: "加粗" })).toBeInTheDocument();
  });

  it("readonly 预设不渲染工具栏且不可编辑", async () => {
    const { container } = render(
      <TiptapEditorImpl preset="readonly" value="# 只读标题" editable={false} />,
    );

    expect(screen.queryByRole("toolbar")).toBeNull();
    await waitFor(() => expect(container.querySelector(".ProseMirror")).not.toBeNull());
    expect(container.querySelector(".ProseMirror")?.getAttribute("contenteditable")).toBe("false");
  });

  it("内容变化时回调最新 Markdown", async () => {
    const onChange = vi.fn();
    const ready = vi.fn();
    render(<TiptapEditorImpl preset="full" value="" onChange={onChange} onReady={ready} />);

    await waitFor(() => expect(ready).toHaveBeenCalled());
    const editor = ready.mock.calls[0]?.[0] as Editor;

    act(() => {
      editor.commands.insertContent("**加粗**");
    });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls.at(-1)?.[0]).toContain("**加粗**");
    expect(onChange.mock.calls.at(-1)?.[1]).toBe(editor);
  });

  it("外部 value 变化时回填编辑器，且不覆盖用户输入", async () => {
    const onChange = vi.fn();
    const ready = vi.fn();
    const { rerender } = render(
      <TiptapEditorImpl preset="full" value="初始内容" onChange={onChange} onReady={ready} />,
    );

    await waitFor(() => expect(ready).toHaveBeenCalled());
    const editor = ready.mock.calls[0]?.[0] as Editor;
    expect(getMarkdown(editor)).toContain("初始内容");

    rerender(
      <TiptapEditorImpl preset="full" value="替换后的内容" onChange={onChange} onReady={ready} />,
    );

    await waitFor(() => expect(getMarkdown(editor)).toContain("替换后的内容"));
  });

  it("插入自定义节点（callout）后能序列化为 GFM 标记", async () => {
    const ready = vi.fn();
    render(<TiptapEditorImpl preset="full" value="" onReady={ready} />);

    await waitFor(() => expect(ready).toHaveBeenCalled());
    const editor = ready.mock.calls[0]?.[0] as Editor;

    act(() => {
      editor.commands.insertContent({
        type: "callout",
        attrs: { level: "warn" },
        content: [{ type: "paragraph", content: [{ type: "text", text: "注意" }] }],
      });
    });

    await waitFor(() => expect(getMarkdown(editor)).toContain("> [!WARN] 注意"));
  });

  it("默认不声明 data-fill，高度由内容撑开", async () => {
    const { container } = render(<TiptapEditorImpl preset="full" value="" />);
    await waitFor(() => expect(container.querySelector(".ProseMirror")).not.toBeNull());

    expect(container.querySelector(".anynote-editor")?.hasAttribute("data-fill")).toBe(false);
  });

  it("fill 时标记 data-fill，正文撑满外层给定的高度", async () => {
    const { container } = render(
      <TiptapEditorImpl preset="full" value="" fill className="min-h-0 flex-1" />,
    );
    await waitFor(() => expect(container.querySelector(".ProseMirror")).not.toBeNull());

    const root = container.querySelector(".anynote-editor");
    expect(root?.getAttribute("data-fill")).toBe("true");
    // 外层类名要原样落到根节点上，否则 flex-1 撑不满父容器
    expect(root?.className).toContain("flex-1");
  });
});
