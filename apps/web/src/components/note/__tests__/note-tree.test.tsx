import { renderWithProviders } from "@/test/render";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoteTree } from "../note-tree";

const bases = [
  { id: 100, name: "甲库" },
  { id: 200, name: "乙库" },
];

function renderTree(overrides: Partial<Parameters<typeof NoteTree>[0]> = {}) {
  return renderWithProviders(
    <NoteTree
      bases={bases}
      activeBaseId={100}
      activeNoteId={1}
      notes={[
        { id: 1, title: "笔记一" },
        { id: 2, title: "笔记二" },
      ]}
      {...overrides}
    />,
  );
}

describe("NoteTree", () => {
  it("展开的知识库展示笔记与链接，当前笔记带 aria-current", () => {
    renderTree();

    const active = screen.getByText("笔记一").closest("a");
    expect(active).toHaveAttribute("href", "/notes/100/1");
    expect(active).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("笔记二").closest("a")).toHaveAttribute("href", "/notes/100/2");
  });

  it("未展开的知识库不渲染笔记列表", () => {
    renderTree();
    // 两篇笔记只在展开的甲库下出现一次，乙库不重复渲染
    expect(screen.getAllByText("笔记一")).toHaveLength(1);
    expect(screen.queryByText("还没有笔记")).not.toBeInTheDocument();
  });

  it("知识库节点链接到对应知识库，展开节点带 aria-current", () => {
    renderTree();

    expect(screen.getByText("甲库").closest("a")).toHaveAttribute("href", "/notes/100");
    expect(screen.getByText("甲库").closest("a")).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("乙库").closest("a")).toHaveAttribute("href", "/notes/200");
  });

  it("加载中展示骨架，不渲染笔记", () => {
    renderTree({ isLoading: true });
    expect(screen.queryByText("笔记一")).not.toBeInTheDocument();
  });

  it("没有拖拽交互时不会误触发移动", () => {
    const onMoveNote = vi.fn();
    renderTree({ onMoveNote });
    expect(onMoveNote).not.toHaveBeenCalled();
  });
});
