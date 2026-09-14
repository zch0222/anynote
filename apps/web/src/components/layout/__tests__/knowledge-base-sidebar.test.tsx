import { renderWithProviders } from "@/test/render";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseNoteIdFromPath, sectionSegmentFromPath } from "../app-sidebar";
import {
  SidebarKnowledgeBaseCard,
  SidebarKnowledgeBaseNav,
  SidebarNoteDirectory,
} from "../knowledge-base-sidebar";

describe("sectionSegmentFromPath", () => {
  it("取出知识库下的第一段", () => {
    expect(sectionSegmentFromPath("/notes/7/docs", 7)).toBe("docs");
    expect(sectionSegmentFromPath("/notes/7/members", 7)).toBe("members");
  });

  it("笔记列表（裸路径）没有段", () => {
    expect(sectionSegmentFromPath("/notes/7", 7)).toBeUndefined();
  });

  it("编辑器路径的那一段是数字，交给 parseKnowledgeBaseSection 回落", () => {
    expect(sectionSegmentFromPath("/notes/7/345", 7)).toBe("345");
  });

  it("只认自己那个知识库的前缀，避免 id 前缀串台", () => {
    // `/notes/70/...` 不该被 baseId=7 的调用当成自己的子路径
    expect(sectionSegmentFromPath("/notes/70/docs", 7)).toBeUndefined();
    expect(sectionSegmentFromPath("/ai/chat", 7)).toBeUndefined();
  });
});

describe("parseNoteIdFromPath", () => {
  it("编辑器路径给出 noteId", () => {
    expect(parseNoteIdFromPath("/notes/7/345", 7)).toBe(345);
  });

  it("静态段不算笔记 id", () => {
    expect(parseNoteIdFromPath("/notes/7/docs", 7)).toBeUndefined();
    expect(parseNoteIdFromPath("/notes/7/overview", 7)).toBeUndefined();
    expect(parseNoteIdFromPath("/notes/7", 7)).toBeUndefined();
  });

  it("非数字与非法值一律不给 id", () => {
    expect(parseNoteIdFromPath("/notes/7/abc", 7)).toBeUndefined();
    expect(parseNoteIdFromPath("/notes/7/0", 7)).toBeUndefined();
    expect(parseNoteIdFromPath("/notes/7/-1", 7)).toBeUndefined();
  });

  it("深度更深的路径只看第一段", () => {
    expect(parseNoteIdFromPath("/notes/7/345/whatever", 7)).toBe(345);
  });
});

describe("SidebarKnowledgeBaseCard", () => {
  it("展示库名、类型与笔记数，并通向画廊换库", () => {
    renderWithProviders(
      <SidebarKnowledgeBaseCard
        base={{ id: 7, knowledgeBaseName: "产品设计知识库", type: 0 }}
        isPending={false}
        noteCount={128}
      />,
    );
    const card = screen.getByTestId("sidebar-kb-card");
    expect(card).toHaveAttribute("href", "/notes");
    expect(within(card).getByText("产品设计知识库")).toBeInTheDocument();
    expect(within(card).getByText("普通知识库 · 128 篇笔记")).toBeInTheDocument();
  });

  it("组织知识库标注为组织库", () => {
    renderWithProviders(
      <SidebarKnowledgeBaseCard
        base={{ id: 9, knowledgeBaseName: "增长实验知识库", type: 1 }}
        isPending={false}
        noteCount={96}
      />,
    );
    expect(screen.getByText("组织知识库 · 96 篇笔记")).toBeInTheDocument();
  });

  it("笔记数未知时不编一个数字出来", () => {
    renderWithProviders(
      <SidebarKnowledgeBaseCard
        base={{ id: 7, knowledgeBaseName: "产品设计知识库", type: 0 }}
        isPending={false}
      />,
    );
    expect(screen.getByText("普通知识库")).toBeInTheDocument();
  });

  it("加载中不渲染半截库名", () => {
    renderWithProviders(<SidebarKnowledgeBaseCard base={undefined} isPending />);
    expect(screen.queryByText("知识库")).not.toBeInTheDocument();
  });
});

describe("SidebarKnowledgeBaseNav", () => {
  it("六个二级入口都指向知识库下的地址，当前项带 aria-current", () => {
    renderWithProviders(<SidebarKnowledgeBaseNav baseId={7} activeSection="notes" counts={{}} />);
    const nav = screen.getByRole("navigation", { name: "知识库内容" });

    expect(within(nav).getByRole("link", { name: /概览/ })).toHaveAttribute(
      "href",
      "/notes/7/overview",
    );
    // 「笔记」是知识库的裸路径，不是 /notes/7/notes
    expect(within(nav).getByRole("link", { name: /笔记/ })).toHaveAttribute("href", "/notes/7");
    expect(within(nav).getByRole("link", { name: /笔记/ })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: /慕课/ })).toHaveAttribute(
      "href",
      "/notes/7/mooc",
    );
    expect(within(nav).getByRole("link", { name: /任务/ })).toHaveAttribute(
      "href",
      "/notes/7/tasks",
    );
    expect(within(nav).getByRole("link", { name: /资料/ })).toHaveAttribute(
      "href",
      "/notes/7/docs",
    );
    expect(within(nav).getByRole("link", { name: /成员/ })).toHaveAttribute(
      "href",
      "/notes/7/members",
    );
  });

  it("计数只给拿到的项，缺的项不渲染 0", () => {
    renderWithProviders(
      <SidebarKnowledgeBaseNav baseId={7} activeSection="notes" counts={{ notes: 128, mooc: 6 }} />,
    );
    const nav = screen.getByRole("navigation", { name: "知识库内容" });

    expect(within(nav).getByRole("link", { name: /笔记/ })).toHaveTextContent("128");
    expect(within(nav).getByRole("link", { name: /慕课/ })).toHaveTextContent("6");
    // 任务没有计数 → 行内只有标题，没有数字
    expect(within(nav).getByRole("link", { name: /任务/ })).toHaveTextContent(/^任务$/);
  });

  it("计数为 0 时照样显示——0 是有效信息，不是缺数据", () => {
    renderWithProviders(
      <SidebarKnowledgeBaseNav baseId={7} activeSection="mooc" counts={{ mooc: 0 }} />,
    );
    const nav = screen.getByRole("navigation", { name: "知识库内容" });
    expect(within(nav).getByRole("link", { name: /慕课/ })).toHaveTextContent("0");
    expect(within(nav).getByRole("link", { name: /慕课/ })).toHaveAttribute("aria-current", "page");
  });
});

describe("SidebarNoteDirectory", () => {
  const notes = [
    { id: 11, title: "交互一致性检查清单", meta: "2 小时前更新" },
    { id: 12, title: "空状态与错误态文案" },
  ];

  it("列出笔记，当前那篇高亮且带摘要行", () => {
    renderWithProviders(
      <SidebarNoteDirectory notes={notes} isLoading={false} baseId={7} activeNoteId={11} />,
    );
    const nav = screen.getByRole("navigation", { name: "笔记列表" });

    const current = within(nav).getByRole("link", { name: /交互一致性检查清单/ });
    expect(current).toHaveAttribute("href", "/notes/7/11");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(within(current).getByText("2 小时前更新")).toBeInTheDocument();

    const other = within(nav).getByRole("link", { name: /空状态与错误态文案/ });
    expect(other).toHaveAttribute("href", "/notes/7/12");
    expect(other).not.toHaveAttribute("aria-current");
  });

  it("加载中给骨架而不是空态", () => {
    renderWithProviders(
      <SidebarNoteDirectory notes={[]} isLoading baseId={7} activeNoteId={undefined} />,
    );
    expect(screen.queryByText("还没有笔记")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("sidebar-note-directory").querySelector("[aria-busy]"),
    ).not.toBeNull();
  });

  it("真的没有笔记时才给空态", () => {
    renderWithProviders(
      <SidebarNoteDirectory notes={[]} isLoading={false} baseId={7} activeNoteId={undefined} />,
    );
    expect(screen.getByText("还没有笔记")).toBeInTheDocument();
  });

  it("非「笔记」面整块收起", () => {
    const { container } = renderWithProviders(
      <SidebarNoteDirectory notes={notes} isLoading={false} baseId={7} hidden />,
    );
    expect(container.querySelector('[data-testid="sidebar-note-directory"]')).toHaveClass("hidden");
  });
});
