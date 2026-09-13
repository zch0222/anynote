import { describe, expect, it } from "vitest";
import { formatCardMeta, formatCountLine, formatRelativeTime } from "../format-time";

/** 固定"现在"，让所有相对时间断言都确定。 */
const NOW = Date.parse("2026-09-14T12:00:00+08:00");
const iso = (offsetMs: number) => new Date(NOW - offsetMs).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
  it("缺失与无法解析的输入返回空串，不显示 Invalid Date", () => {
    expect(formatRelativeTime(null, NOW)).toBe("");
    expect(formatRelativeTime(undefined, NOW)).toBe("");
    expect(formatRelativeTime("", NOW)).toBe("");
    expect(formatRelativeTime("不是日期", NOW)).toBe("");
  });

  it("一分钟以内是刚刚", () => {
    expect(formatRelativeTime(iso(0), NOW)).toBe("刚刚");
    expect(formatRelativeTime(iso(59_000), NOW)).toBe("刚刚");
  });

  it("分钟与小时按向下取整", () => {
    expect(formatRelativeTime(iso(MINUTE), NOW)).toBe("1 分钟前");
    expect(formatRelativeTime(iso(59 * MINUTE), NOW)).toBe("59 分钟前");
    expect(formatRelativeTime(iso(HOUR), NOW)).toBe("1 小时前");
    expect(formatRelativeTime(iso(23 * HOUR), NOW)).toBe("23 小时前");
  });

  it("一天到一周用天，昨天单独成词", () => {
    expect(formatRelativeTime(iso(DAY), NOW)).toBe("昨天");
    expect(formatRelativeTime(iso(2 * DAY), NOW)).toBe("2 天前");
    expect(formatRelativeTime(iso(6 * DAY), NOW)).toBe("6 天前");
  });

  it("一周到两周是上周，再往上按周 / 月 / 年递进", () => {
    expect(formatRelativeTime(iso(7 * DAY), NOW)).toBe("上周");
    expect(formatRelativeTime(iso(13 * DAY), NOW)).toBe("上周");
    expect(formatRelativeTime(iso(14 * DAY), NOW)).toBe("2 周前");
    expect(formatRelativeTime(iso(35 * DAY), NOW)).toBe("1 个月前");
    expect(formatRelativeTime(iso(400 * DAY), NOW)).toBe("1 年前");
  });

  it("服务端时钟略快导致的未来时间按刚刚处理，不出现负数", () => {
    expect(formatRelativeTime(new Date(NOW + 5 * MINUTE).toISOString(), NOW)).toBe("刚刚");
    expect(formatRelativeTime("2026-09-15T00:00:00+08:00", NOW)).toBe("刚刚");
  });
});

describe("formatCountLine", () => {
  it("零值与空值不占位——卡片上不出现 0 个任务这种噪音", () => {
    expect(
      formatCountLine([
        { count: 0, unit: "篇笔记" },
        { count: null, unit: "节慕课" },
        { count: undefined, unit: "个任务" },
      ]),
    ).toBe("");
  });

  it("只保留有值的维度并按传入顺序拼接", () => {
    expect(
      formatCountLine([
        { count: 128, unit: "篇笔记" },
        { count: 6, unit: "节慕课" },
        { count: 0, unit: "个任务" },
      ]),
    ).toBe("128 篇笔记 · 6 节慕课");
  });

  it("全部为空时返回空串", () => {
    expect(formatCountLine([])).toBe("");
  });
});

describe("formatCardMeta", () => {
  it("计数与相对时间都有时用 · 连接，并补上更新二字", () => {
    expect(
      formatCardMeta({
        updatedAt: iso(2 * HOUR),
        counts: [
          { count: 128, unit: "篇笔记" },
          { count: 6, unit: "节慕课" },
        ],
        now: NOW,
      }),
    ).toBe("128 篇笔记 · 6 节慕课 · 2 小时前更新");
  });

  it("只有时间时不留下悬空的分隔符", () => {
    expect(formatCardMeta({ updatedAt: iso(DAY), now: NOW })).toBe("昨天更新");
  });

  it("只有计数时也成立（组织知识库的成员维度）", () => {
    expect(
      formatCardMeta({
        updatedAt: null,
        counts: [
          { count: 18, unit: "位成员" },
          { count: 96, unit: "篇笔记" },
        ],
        now: NOW,
      }),
    ).toBe("18 位成员 · 96 篇笔记");
  });

  it("什么都没有时返回空串，由调用方决定是否隐藏整行", () => {
    expect(formatCardMeta({ now: NOW })).toBe("");
  });
});
