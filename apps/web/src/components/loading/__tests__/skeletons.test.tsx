import {
  CardGridSkeleton,
  DocumentSkeleton,
  EditorSkeleton,
  ListRowsSkeleton,
  PanelSkeleton,
  TableSkeleton,
} from "@/components/loading/skeletons";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * 骨架预设。
 *
 * 这些用例护的核心不是"渲染出几个灰块"，而是两条会被"看起来更简单"的实现破坏的性质：
 *
 * 1. **每一块都必须带 `aria-busy`**：读屏用户不然只会念到一个空区域，
 *    无从知道"这里正在变"。同时各 `Skeleton` 自己是 `aria-hidden`，
 *    不然一块骨架会刷屏。
 * 2. **形状要对得上宿主**：卡片网格必须真的是网格、行列表必须真的是行。
 *    形状错了，加载完成时整页跳一下——比不显示骨架更糟。
 */

/** 每个预设都必须满足的公共契约。 */
function expectBusyRegion(slot: string, countAtLeast = 1) {
  const region = document.querySelector(`[data-slot="${slot}"]`);
  expect(region, `${slot} 应存在`).not.toBeNull();
  expect(region?.getAttribute("aria-busy"), `${slot} 缺 aria-busy 读屏就不知道这里在加载`).toBe(
    "true",
  );
  const blocks = region?.querySelectorAll('[data-slot="skeleton"]') ?? [];
  expect(blocks.length).toBeGreaterThanOrEqual(countAtLeast);
  for (const block of blocks) {
    expect(block.getAttribute("aria-hidden")).toBe("true");
  }
}

describe("骨架预设的公共契约", () => {
  it("每个预设都有 aria-busy，且内部灰块对读屏隐藏", () => {
    const { container, unmount } = render(<CardGridSkeleton />);
    expectBusyRegion("skeleton-card-grid");
    unmount();

    render(<ListRowsSkeleton />);
    expectBusyRegion("skeleton-list");
  });

  it("TableSkeleton / DocumentSkeleton / EditorSkeleton / PanelSkeleton 同样合规", () => {
    for (const [slot, node] of [
      ["skeleton-table", <TableSkeleton key="t" />],
      ["skeleton-document", <DocumentSkeleton key="d" />],
      ["skeleton-editor", <EditorSkeleton key="e" />],
      ["skeleton-panel", <PanelSkeleton key="p" />],
    ] as const) {
      const { unmount } = render(node);
      expectBusyRegion(slot);
      unmount();
    }
  });
});

describe("CardGridSkeleton", () => {
  it("用与画廊相同的三档断点，加载完成时列数不突变", () => {
    const { container } = render(<CardGridSkeleton />);
    const grid = container.querySelector('[data-slot="skeleton-card-grid"]');
    expect(grid?.getAttribute("class")).toContain("sm:grid-cols-2");
    expect(grid?.getAttribute("class")).toContain("lg:grid-cols-3");
  });

  it("默认 6 块，块数与列数成整倍数（末行不留缺口）", () => {
    const { container } = render(<CardGridSkeleton />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6);
  });

  it("卡片高度可覆写（画廊 148px / 慕课 40 / 协同 36）", () => {
    const { container } = render(<CardGridSkeleton cardClassName="h-40" />);
    expect(container.querySelector('[data-slot="skeleton"]')?.getAttribute("class")).toContain(
      "h-40",
    );
  });
});

describe("ListRowsSkeleton", () => {
  it("每一行是「缩略图 + 一行文字 + 右端元信息」——笔记行的真实结构", () => {
    const { container } = render(<ListRowsSkeleton count={1} />);
    const row = container.querySelector('[data-slot="skeleton-list"] > div');
    expect(row?.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
    // 行高与笔记行一致（min-h-14），加载完成时行高不跳
    expect(row?.getAttribute("class")).toContain("min-h-14");
  });

  it("默认 5 行，数量可覆写", () => {
    const { container, unmount } = render(<ListRowsSkeleton />);
    expect(container.querySelectorAll('[data-slot="skeleton-list"] > div')).toHaveLength(5);
    unmount();

    const { container: two } = render(<ListRowsSkeleton count={2} />);
    expect(two.querySelectorAll('[data-slot="skeleton-list"] > div')).toHaveLength(2);
  });
});

describe("TableSkeleton", () => {
  it("表头行窄、数据行宽：视觉上能分辨哪一行是表头", () => {
    const { container } = render(<TableSkeleton rows={2} columns={3} />);
    const rows = container.querySelectorAll('[data-slot="skeleton-table"] > div');
    // 表头 + 2 数据行
    expect(rows).toHaveLength(3);
    expect(rows[0]?.getAttribute("class")).toContain("border-b");
  });

  it("行数列数可覆写", () => {
    const { container } = render(<TableSkeleton rows={6} columns={2} />);
    expect(container.querySelectorAll('[data-slot="skeleton-table"] > div')).toHaveLength(7);
    expect(
      container
        .querySelectorAll('[data-slot="skeleton-table"] > div')[0]
        ?.querySelectorAll('[data-slot="skeleton"]'),
    ).toHaveLength(2);
  });
});

describe("DocumentSkeleton", () => {
  it("给的是带纸张比例的纸面，用户能预判「待会儿这里会有多高」", () => {
    const { container } = render(<DocumentSkeleton />);
    const paper = container.querySelector(".aspect-\\[1\\/1\\.414\\]");
    expect(paper, "A4 比例占位缺失").not.toBeNull();
    expect(paper?.getAttribute("data-slot")).toBe("skeleton");
  });
});

describe("EditorSkeleton", () => {
  it("段落宽度参差——等宽的一叠灰条看起来像表格，参差才像文章", () => {
    const { container } = render(<EditorSkeleton paragraphs={6} />);
    const blocks = Array.from(container.querySelectorAll('[data-slot="skeleton"]'));
    const widths = blocks.map((block) => block.getAttribute("class") ?? "");
    const paragraphWidths = widths.filter((value) => value.includes("h-3.5"));
    expect(paragraphWidths.length).toBe(6);
    // 至少出现两种不同的宽度
    const distinct = new Set(paragraphWidths.map((value) => /w-[\w/[\]]+/.exec(value)?.[0]));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("标题位比段落位高（Display 字阶 vs Body 字阶）", () => {
    const { container } = render(<EditorSkeleton />);
    const first = container.querySelector('[data-slot="skeleton"]');
    expect(first?.getAttribute("class")).toContain("h-7");
  });
});

describe("PanelSkeleton", () => {
  it("一整块面板：标题 + 两行正文，不拆成很多小条（那会让人以为元素很多）", () => {
    const { container } = render(<PanelSkeleton />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  });
});
