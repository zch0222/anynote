import { knowledgeBaseSections } from "@/components/layout/navigation";
import { describe, expect, it } from "vitest";
import {
  OVERVIEW_TILES,
  TILE_BLOCK_CLASS,
  tileCountText,
  tileKeysCoveredBySidebar,
} from "../overview-sections";

describe("overview-sections（D-02 内容概况 5 格）", () => {
  it("顺序与侧栏二级导航一一对应（图例：5 格与侧栏二级导航一一对应）", () => {
    // 侧栏是 概览 / 笔记 / 慕课 / 任务 / 资料 / 成员；概览自己不是内容面，不进 5 格
    const sidebarContentKeys = knowledgeBaseSections
      .filter((section) => section.key !== "overview")
      .map((section) => section.key);
    expect(OVERVIEW_TILES.map((tile) => tile.key)).toEqual(sidebarContentKeys);
  });

  it("恰好 5 格", () => {
    expect(OVERVIEW_TILES).toHaveLength(5);
  });

  it("标签与侧栏同名 section 的标题一致", () => {
    for (const tile of OVERVIEW_TILES) {
      const section = knowledgeBaseSections.find((item) => item.key === tile.key);
      expect(section?.title, `${tile.key} 在侧栏找不到同名 section`).toBe(tile.label);
    }
  });

  it("地址函数：笔记走裸路径，其余各占一段", () => {
    expect(OVERVIEW_TILES.find((t) => t.key === "notes")?.href(7)).toBe("/notes/7");
    expect(OVERVIEW_TILES.find((t) => t.key === "mooc")?.href(7)).toBe("/notes/7/mooc");
    expect(OVERVIEW_TILES.find((t) => t.key === "tasks")?.href(7)).toBe("/notes/7/tasks");
    expect(OVERVIEW_TILES.find((t) => t.key === "docs")?.href(7)).toBe("/notes/7/docs");
    expect(OVERVIEW_TILES.find((t) => t.key === "members")?.href(7)).toBe("/notes/7/members");
  });

  it("5 格都有色块，且色块互不相同（靠颜色区分维度）", () => {
    const classes = OVERVIEW_TILES.map((tile) => TILE_BLOCK_CLASS[tile.key]);
    expect(classes.every(Boolean)).toBe(true);
    expect(new Set(classes).size).toBe(OVERVIEW_TILES.length);
  });

  it("资料用靛蓝而不是 info 青（图例 14「色块 靛」）", () => {
    expect(TILE_BLOCK_CLASS.docs).toBe("bg-indigo");
  });

  it("tileKeysCoveredBySidebar 只返回侧栏真有的 key", () => {
    expect(tileKeysCoveredBySidebar()).toEqual(["notes", "mooc", "tasks", "docs", "members"]);
  });
});

describe("tileCountText", () => {
  it("数字原样返回", () => {
    expect(tileCountText(0)).toBe("0");
    expect(tileCountText(128)).toBe("128");
  });

  it("undefined / null 返回 null（数据未到不给 0）", () => {
    expect(tileCountText(undefined)).toBeNull();
    expect(tileCountText(null)).toBeNull();
  });

  it("非有限数返回 null（NaN / Infinity 不落成文案）", () => {
    expect(tileCountText(Number.NaN)).toBeNull();
    expect(tileCountText(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
