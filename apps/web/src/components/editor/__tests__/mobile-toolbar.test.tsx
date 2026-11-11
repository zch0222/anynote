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

  /**
   * 走查 E-03：360px 视口下 8 个 40px 常驻按钮已经 392px，溢出入口若也参与横滑，
   * 只会露出 16px，「更多格式」背后的 15 个命令几乎等于不可达。
   * 现在横滑只发生在 `editor-toolbar-scroll` 里，「更多」被单独固定在右端。
   */
  it("「更多格式」固定在横滑区之外，横滑区里只有常驻命令", async () => {
    render(<TiptapEditorImpl preset="full" toolbar="mobile" value="" />);
    const toolbar = await screen.findByRole("toolbar");

    const scroll = screen.getByTestId("editor-toolbar-scroll");
    const more = screen.getByTestId("editor-toolbar-more");
    const moreButton = screen.getByRole("button", { name: "更多格式" });

    expect(scroll.contains(screen.getByRole("button", { name: LABELS.bold }))).toBe(true);
    expect(scroll.contains(moreButton)).toBe(false);
    expect(more.contains(moreButton)).toBe(true);
    expect(toolbar.contains(more)).toBe(true);
    // 常驻命令一个不少地待在滚动区里
    expect(scroll.querySelectorAll("button")).toHaveLength(MOBILE_PRIMARY.length);
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

/**
 * `none`：设计稿的桌面编辑器从标题直接进正文，没有常驻工具条。
 * 格式化改走选区气泡菜单、Slash 菜单与快捷键。
 */
describe("Toolbar variant=none", () => {
  it("整条工具条不渲染，但编辑器本体照常挂着", async () => {
    const { container } = render(<TiptapEditorImpl preset="full" toolbar="none" value="内容" />);

    await waitFor(() => expect(container.querySelector(".anynote-editor__content")).not.toBeNull());
    expect(screen.queryByRole("toolbar", { name: "编辑器工具栏" })).toBeNull();
    // data-toolbar 仍是 none：样式与 E2E 靠它区分形态
    expect(container.querySelector(".anynote-editor")).toHaveAttribute("data-toolbar", "none");
  });

  it("只读预设本来就没有工具条，none 不改变这一点", async () => {
    const { container } = render(
      <TiptapEditorImpl preset="readonly" toolbar="none" value="# 只读" editable={false} />,
    );
    await waitFor(() => expect(container.querySelector(".anynote-editor__content")).not.toBeNull());
    expect(screen.queryByRole("toolbar")).toBeNull();
  });
});
