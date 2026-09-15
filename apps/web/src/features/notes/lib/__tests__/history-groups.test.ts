import { describe, expect, it } from "vitest";
import { UNKNOWN_DAY_LABEL, formatHistoryTime, groupByDay } from "../history-groups";

/** 分组只认时间字段，用例里给最小可辨识的载荷即可。 */
function row(id: number, time: string | null) {
  return { id, operationTime: time };
}

/** 固定「现在」：2026-09-16（周三）12:00 本地时间。 */
const NOW = new Date(2026, 8, 16, 12, 0, 0);

describe("groupByDay", () => {
  it("今天 / 昨天用固定文案，其余用 MM-dd 周X", () => {
    const groups = groupByDay(
      [
        row(1, new Date(2026, 8, 16, 11, 5).toISOString()),
        row(2, new Date(2026, 8, 15, 23, 59).toISOString()),
        row(3, new Date(2026, 8, 12, 9, 0).toISOString()),
      ],
      NOW,
    );

    expect(groups.map((group) => group.label)).toEqual(["今天", "昨天", "09-12 周六"]);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([[1], [2], [3]]);
  });

  /**
   * 关键边界：23:59 与次日 00:01 只差 2 分钟，但属于两个日历日。
   * 若按"时间差 < 24h"判昨天，这两条会被并成一组，用户看到的"今天"里
   * 混着昨晚的版本。
   */
  it("按本地日历日切分，不按 24 小时差", () => {
    const groups = groupByDay(
      [
        row(1, new Date(2026, 8, 16, 0, 1).toISOString()),
        row(2, new Date(2026, 8, 15, 23, 59).toISOString()),
      ],
      NOW,
    );

    expect(groups.map((group) => group.label)).toEqual(["今天", "昨天"]);
  });

  it("同一天的连续记录合并成一组，保持入参顺序", () => {
    const groups = groupByDay(
      [
        row(1, new Date(2026, 8, 16, 11, 5).toISOString()),
        row(2, new Date(2026, 8, 16, 9, 30).toISOString()),
        row(3, new Date(2026, 8, 16, 8, 0).toISOString()),
        row(4, new Date(2026, 8, 15, 20, 0).toISOString()),
      ],
      NOW,
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]?.items.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(groups[1]?.items.map((item) => item.id)).toEqual([4]);
  });

  it("跨年补全年份：去年的同一天不能只显示 09-16", () => {
    const groups = groupByDay([row(1, new Date(2025, 8, 12, 9, 0).toISOString())], NOW);

    expect(groups[0]?.label).toBe("2025-09-12 周五");
  });

  it("周几按本地日历取，周日是 周日 不是 周一", () => {
    // 2026-09-13 是周日，2026-09-14 是周一
    const groups = groupByDay(
      [row(1, new Date(2026, 8, 13, 9, 0).toISOString()), row(2, new Date(2026, 8, 14, 9, 0).toISOString())],
      NOW,
    );

    expect(groups.map((group) => group.label)).toEqual(["09-13 周日", "09-14 周一"]);
  });

  it("个位数月份与日期补零，列宽对齐", () => {
    const groups = groupByDay([row(1, new Date(2026, 0, 5, 9, 0).toISOString())], NOW);

    expect(groups[0]?.label).toBe("01-05 周一");
  });

  it("空列表返回空数组", () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });

  it("时间缺失或非法时归到「未知时间」，不静默丢条目", () => {
    const groups = groupByDay([row(1, null), row(2, "不是时间"), row(3, "2026-09-16T03:00:00.000Z")], NOW);

    expect(groups[0]?.label).toBe(UNKNOWN_DAY_LABEL);
    expect(groups[0]?.items.map((item) => item.id)).toEqual([1, 2]);
    expect(groups[1]?.items.map((item) => item.id)).toEqual([3]);
  });

  it("兼容单版本详情的 historyTime 字段名", () => {
    const groups = groupByDay([{ id: 1, historyTime: new Date(2026, 8, 16, 11, 5).toISOString() }], NOW);

    expect(groups[0]?.label).toBe("今天");
  });

  it("未来时间按具体日期显示，不出现负数或「明天」", () => {
    const groups = groupByDay([row(1, new Date(2026, 8, 17, 9, 0).toISOString())], NOW);

    expect(groups[0]?.label).toBe("09-17 周四");
  });
});

describe("formatHistoryTime", () => {
  it("今天 / 昨天带时分，其余带日期与时分", () => {
    expect(formatHistoryTime(new Date(2026, 8, 16, 11, 5).toISOString(), NOW)).toBe("今天 11:05");
    expect(formatHistoryTime(new Date(2026, 8, 15, 23, 59).toISOString(), NOW)).toBe("昨天 23:59");
    expect(formatHistoryTime(new Date(2026, 8, 12, 9, 0).toISOString(), NOW)).toBe("09-12 周六 09:00");
  });

  /**
   * 与分组标签同源：00:05 时看 23:50 那一版，行内说「昨天 23:50」、
   * 分组也说「昨天」。若这里改用 formatRelativeTime 会得到「15 分钟前」，
   * 同一屏里两句话互相矛盾。
   */
  it("刚过午夜时与分组标签一致，不出现「15 分钟前」与「昨天」并存", () => {
    const justAfterMidnight = new Date(2026, 8, 16, 0, 5);
    const groups = groupByDay([row(1, new Date(2026, 8, 15, 23, 50).toISOString())], justAfterMidnight);

    expect(groups[0]?.label).toBe("昨天");
    expect(formatHistoryTime(new Date(2026, 8, 15, 23, 50).toISOString(), justAfterMidnight)).toBe(
      "昨天 23:50",
    );
  });

  it("时分补零；缺失或非法时间返回空串", () => {
    expect(formatHistoryTime(new Date(2026, 8, 16, 9, 5).toISOString(), NOW)).toBe("今天 09:05");
    expect(formatHistoryTime(null, NOW)).toBe("");
    expect(formatHistoryTime("不是时间", NOW)).toBe("");
  });
});
