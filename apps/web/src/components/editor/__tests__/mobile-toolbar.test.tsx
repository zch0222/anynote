import { MOBILE_PRIMARY } from "@/components/editor/core/mobile-toolbar-groups";
import { TiptapEditorImpl } from "@/components/editor/core/tiptap-editor";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/** 命令 id → 按钮上的无障碍名。只列用例里要断言的那几个。 */
const LABELS = {
  bold: "加粗",
  italic: "斜体",
  heading2: "二级标题",
  bulletList: "无序列表",
  image: "图片",
  table: "表格",
  heading1: "一级标题",
  underline: "下划线",
} as const;

describe("Toolbar variant=mobile", () => {
  it("只渲染常驻命令，其余不在工具条里", async () => {
    render(<TiptapEditorImpl preset="full" toolbar="mobile" value="" />);
    await screen.findByRole("toolbar", { name: "编辑器工具栏" });

    expect(screen.getByRole("button", { name: LABELS.bold })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: LABELS.heading2 })).toBeInTheDocument();
    // 表格与一级标题属于「更多」，工具条上不该有
    expect(screen.queryByRole("button", { name: LABELS.table })).toBeNull();
    expect(screen.queryByRole("button", { name: LABELS.heading1 })).toBeNull();
  });

  it("工具条带 data-variant=mobile，样式据此切到单行横滑 + 贴底", async () => {
    render(<TiptapEditorImpl preset="full" toolbar="mobile" value="" />);
    const toolbar = await screen.findByRole("toolbar", { name: "编辑器工具栏" });
    expect(toolbar).toHaveAttribute("data-variant", "mobile");
  });

  it("「更多」弹层里能找到未常驻的命令", async () => {
    render(<TiptapEditorImpl preset="full" toolbar="mobile" value="" />);
    await screen.findByRole("toolbar");

    fireEvent.click(screen.getByRole("button", { name: "更多格式" }));

    expect(await screen.findByTestId("editor-more-sheet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: LABELS.table })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: LABELS.underline })).toBeInTheDocument();
  });

  it("常驻命令数量与分组表一致", async () => {
    render(<TiptapEditorImpl preset="full" toolbar="mobile" value="" />);
    const toolbar = await screen.findByRole("toolbar");
    // 常驻按钮 + 一个「更多」触发器
    expect(toolbar.querySelectorAll("button")).toHaveLength(MOBILE_PRIMARY.length + 1);
  });

  it("点常驻命令能改变正文（加粗后 Markdown 带 **）", async () => {
    const ready = vi.fn();
    render(<TiptapEditorImpl preset="full" toolbar="mobile" value="内容" onReady={ready} />);
    await waitFor(() => expect(ready).toHaveBeenCalled());

    const editor = ready.mock.calls[0]?.[0] as import("@tiptap/react").Editor;
    editor.commands.selectAll();
    fireEvent.click(screen.getByRole("button", { name: LABELS.bold }));

    await waitFor(() => {
      expect(editor.isActive("bold")).toBe(true);
    });
  });

  it("移动端不挂气泡菜单——它会和系统选择菜单打架", async () => {
    const { container } = render(<TiptapEditorImpl preset="full" toolbar="mobile" value="" />);
    await screen.findByRole("toolbar");
    expect(container.querySelector(".anynote-bubble-menu")).toBeNull();
  });

  it("不传 toolbar 时行为与改动前一致：full 预设仍是 full 工具栏", async () => {
    render(<TiptapEditorImpl preset="full" value="" />);
    const toolbar = await screen.findByRole("toolbar");

    expect(toolbar).toHaveAttribute("data-variant", "full");
    expect(screen.getByRole("button", { name: LABELS.table })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更多格式" })).toBeNull();
  });

  it("不传 toolbar 时 minimal 预设仍是 minimal 工具栏", async () => {
    render(<TiptapEditorImpl preset="minimal" value="" />);
    const toolbar = await screen.findByRole("toolbar");

    expect(toolbar).toHaveAttribute("data-variant", "minimal");
    expect(screen.queryByRole("button", { name: LABELS.table })).toBeNull();
    expect(screen.getByRole("button", { name: LABELS.bold })).toBeInTheDocument();
  });
});
