import {
  HEAT_LEVELS,
  HEAT_MEMBER_LIMIT,
  collapseMembers,
  formatHeatDay,
  heatCellLabel,
  isFutureDay,
  levelOf,
} from "@/features/tasks/lib/heatmap";
import { describe, expect, it } from "vitest";

describe("levelOf", () => {
  it("0 次落 0 档（中性灰），不是最浅的蓝", () => {
    expect(levelOf(0, 40)).toBe(0);
    expect(levelOf(-3, 40)).toBe(0);
  });

  it("按 count / max 线性分 1–5 档，最大值落满档", () => {
    expect(levelOf(40, 40)).toBe(HEAT_LEVELS);
    expect(levelOf(8, 40)).toBe(1);
    expect(levelOf(9, 40)).toBe(2);
    expect(levelOf(24, 40)).toBe(3);
    expect(levelOf(32, 40)).toBe(4);
    expect(levelOf(39, 40)).toBe(5);
  });

  /** 整张图没有任何编辑时 max 为 0；除以 0 会得到 Infinity，把一格灰点成最深的蓝。 */
  it("max 为 0 或非法时一律 0 档", () => {
    expect(levelOf(5, 0)).toBe(0);
    expect(levelOf(5, Number.NaN)).toBe(0);
    expect(levelOf(Number.NaN, 10)).toBe(0);
  });
});

describe("isFutureDay", () => {
  it("按 yyyy-MM-dd 字典序比较，今天不算未到", () => {
    expect(isFutureDay("2026-09-12", "2026-09-11")).toBe(true);
    expect(isFutureDay("2026-09-11", "2026-09-11")).toBe(false);
    expect(isFutureDay("2026-09-10", "2026-09-11")).toBe(false);
  });

  it("服务端没给 today 时不画未来列（宁可不画也不误标）", () => {
    expect(isFutureDay("2026-09-12", null)).toBe(false);
    expect(isFutureDay("2026-09-12", undefined)).toBe(false);
  });
});

describe("formatHeatDay", () => {
  it("yyyy-MM-dd → MM-dd", () => {
    expect(formatHeatDay("2026-09-12")).toBe("09-12");
  });
});

const member = (userId: number, total: number, counts: number[], nickname?: string) => ({
  userId,
  nickname: nickname ?? `成员${userId}`,
  total,
  counts,
});

describe("collapseMembers", () => {
  it("不超过 12 人时原样返回，但按 total 降序", () => {
    const rows = collapseMembers([
      member(1, 3, [1, 2]),
      member(2, 9, [4, 5]),
      member(3, 0, [0, 0]),
    ]);
    expect(rows.map((row) => row.label)).toEqual(["成员2", "成员1", "成员3"]);
    expect(rows.every((row) => !row.collapsed)).toBe(true);
    expect(rows[0]?.memberCount).toBe(1);
  });

  it("超过 12 人时只留前 12 行，其余合并成「其余 N 人」且逐日相加", () => {
    const raw = Array.from({ length: 15 }, (_, index) =>
      member(index + 1, 100 - index, [index, 1]),
    );
    const rows = collapseMembers(raw);

    expect(rows).toHaveLength(HEAT_MEMBER_LIMIT + 1);
    expect(rows[HEAT_MEMBER_LIMIT]?.label).toBe("其余 3 人");
    expect(rows[HEAT_MEMBER_LIMIT]?.collapsed).toBe(true);
    expect(rows[HEAT_MEMBER_LIMIT]?.memberCount).toBe(3);
    // 被折叠的是 13/14/15 号，日 0 的 counts 是 12 + 13 + 14
    expect(rows[HEAT_MEMBER_LIMIT]?.counts[0]).toBe(12 + 13 + 14);
    // 排序是真按 total 排的，前 12 名就是活跃前 12 名
    expect(rows[0]?.label).toBe("成员1");
    expect(rows[11]?.label).toBe("成员12");
  });

  it("total 相同保持后端给的顺序（稳定排序，两次渲染行序一致）", () => {
    const rows = collapseMembers([member(7, 5, [5]), member(8, 5, [5]), member(9, 5, [5])]);
    expect(rows.map((row) => row.label)).toEqual(["成员7", "成员8", "成员9"]);
  });

  it("total 缺失时用 counts 求和兜底；counts 缺失按 0", () => {
    const rows = collapseMembers([
      { userId: 1, nickname: "甲", counts: [1, 2, 3] },
      { userId: 2, nickname: "乙", total: 9 },
    ]);
    expect(rows.map((row) => row.label)).toEqual(["乙", "甲"]);
    expect(rows[1]?.counts).toEqual([1, 2, 3]);
  });

  it("没有昵称时退回用户名，都没有时给占位名", () => {
    const rows = collapseMembers([
      { userId: 1, username: "zhangsan", counts: [] },
      { userId: 2, counts: [] },
    ]);
    expect(rows[0]?.label).toBe("zhangsan");
    expect(rows[1]?.label).toBe("未命名成员");
  });

  it("空输入不炸", () => {
    expect(collapseMembers([])).toEqual([]);
  });
});

describe("heatCellLabel", () => {
  it("按图例 19 拼「昵称 · MM-dd 编辑 n 次」", () => {
    const [row] = collapseMembers([member(1, 41, [41], "林一")]);
    expect(row && heatCellLabel(row, "2026-09-12", 41)).toBe("林一 · 09-12 编辑 41 次");
  });

  it("折叠行报「其余 N 人」而不是某个人的名字", () => {
    const raw = Array.from({ length: 14 }, (_, index) => member(index + 1, 10, [1]));
    const rows = collapseMembers(raw);
    const rest = rows[rows.length - 1];
    expect(rest && heatCellLabel(rest, "2026-09-12", 2)).toBe("其余 2 人 · 09-12 编辑 2 次");
  });
});
