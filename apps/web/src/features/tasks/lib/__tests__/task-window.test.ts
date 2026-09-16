import {
  DAYS_LEFT_WARNING,
  canResubmit,
  canSubmit,
  completionRate,
  formatRate,
  daysLeft,
  daysLeftText,
  defaultEndTime,
  defaultStartTime,
  formatTaskWindow,
  presetEndTime,
  taskPhase,
} from "@/features/tasks/lib/task-window";
import { describe, expect, it } from "vitest";

/** 固定时钟：所有判定都靠它，用例之间不共享可变状态。 */
const NOW = new Date("2026-09-11T12:00:00");

const WINDOW = {
  startTime: "2026-09-10T10:00:00",
  endTime: "2026-09-18T23:59:00",
};

describe("taskPhase", () => {
  it("未开始 / 进行中 / 已截止三态", () => {
    expect(taskPhase("2026-09-12T00:00:00", "2026-09-18T00:00:00", NOW)).toBe("upcoming");
    expect(taskPhase("2026-09-10T00:00:00", "2026-09-18T00:00:00", NOW)).toBe("active");
    expect(taskPhase("2026-09-01T00:00:00", "2026-09-10T00:00:00", NOW)).toBe("closed");
  });

  /**
   * 后端判的是 `now > endTime` / `now < startTime`，所以**恰好等于边界仍然可提交**。
   * 这里写成开区间就会在最后一分钟把按钮灰掉，与后端 200 的结果不一致。
   */
  it("刚好落在开始 / 截止时刻都算进行中", () => {
    const atStart = new Date("2026-09-10T10:00:00");
    const atEnd = new Date("2026-09-18T23:59:00");
    expect(taskPhase(WINDOW.startTime, WINDOW.endTime, atStart)).toBe("active");
    expect(taskPhase(WINDOW.startTime, WINDOW.endTime, atEnd)).toBe("active");
    // 再晚 1 毫秒才截止
    expect(taskPhase(WINDOW.startTime, WINDOW.endTime, new Date(atEnd.getTime() + 1))).toBe(
      "closed",
    );
    // 再早 1 毫秒还没开始
    expect(taskPhase(WINDOW.startTime, WINDOW.endTime, new Date(atStart.getTime() - 1))).toBe(
      "upcoming",
    );
  });

  it("缺字段按不设限处理，不崩也不误判", () => {
    expect(taskPhase(null, null, NOW)).toBe("active");
    expect(taskPhase(null, "2026-09-18T00:00:00", NOW)).toBe("active");
    expect(taskPhase("not-a-date", "2026-09-18T00:00:00", NOW)).toBe("active");
  });
});

describe("daysLeft", () => {
  it("向上取整：最后 24 小时内都显示还剩 1 天", () => {
    expect(daysLeft("2026-09-18T23:59:00", NOW)).toBe(8);
    // 差 1 秒不满 24 小时，向上取整仍是 1 天
    expect(daysLeft("2026-09-12T11:59:59", NOW)).toBe(1);
    // 正好 24 小时
    expect(daysLeft("2026-09-12T12:00:00", NOW)).toBe(1);
    // 多 1 秒就跨进第 2 天——向上取整的必然结果，不是 bug
    expect(daysLeft("2026-09-12T12:00:01", NOW)).toBe(2);
  });

  it("已截止返回 0，没有截止时间返回 null", () => {
    expect(daysLeft("2026-09-01T00:00:00", NOW)).toBe(0);
    expect(daysLeft(null, NOW)).toBeNull();
  });

  it("文案：已截止 / 还剩 N 天 / 不限时给空串", () => {
    expect(daysLeftText("2026-09-01T00:00:00", NOW)).toBe("已截止");
    expect(daysLeftText("2026-09-18T23:59:00", NOW)).toBe("还剩 8 天");
    expect(daysLeftText(null, NOW)).toBe("");
  });

  it("剩余 3 天正是 warning 阈值", () => {
    expect(daysLeft("2026-09-14T12:00:00", NOW)).toBe(DAYS_LEFT_WARNING);
  });
});

describe("canSubmit / canResubmit", () => {
  const cases = [
    // status, phase 输入, canSubmit, canResubmit
    { status: 0, phase: "active", submit: true, resubmit: false },
    { status: 0, phase: "upcoming", submit: false, resubmit: false },
    { status: 0, phase: "closed", submit: false, resubmit: false },
    // §1.4 第 3 条：已提交且未截止时后端拒绝再次提交，界面上不能出「重新提交」
    { status: 1, phase: "active", submit: false, resubmit: false },
    { status: 1, phase: "closed", submit: false, resubmit: false },
    // 2 = 无需提交（本库管理员自己）
    { status: 2, phase: "active", submit: false, resubmit: false },
    // 3 = 已退回，窗口内才能重新提交
    { status: 3, phase: "active", submit: false, resubmit: true },
    { status: 3, phase: "upcoming", submit: false, resubmit: false },
    { status: 3, phase: "closed", submit: false, resubmit: false },
  ] as const;

  const windows = {
    active: ["2026-09-10T10:00:00", "2026-09-18T23:59:00"],
    upcoming: ["2026-09-12T10:00:00", "2026-09-18T23:59:00"],
    closed: ["2026-09-01T10:00:00", "2026-09-10T23:59:00"],
  } as const;

  it.each(cases)(
    "status=$status · phase=$phase → 提交=$submit 重新提交=$resubmit",
    ({ status, phase, submit, resubmit }) => {
      const [startTime, endTime] = windows[phase];
      const task = { submissionStatus: status, startTime, endTime };
      expect(canSubmit(task, NOW)).toBe(submit);
      expect(canResubmit(task, NOW)).toBe(resubmit);
    },
  );

  it("状态缺失时两个判定都为 false（不猜）", () => {
    const task = { submissionStatus: null, ...WINDOW };
    expect(canSubmit(task, NOW)).toBe(false);
    expect(canResubmit(task, NOW)).toBe(false);
  });
});

describe("默认与快捷时间", () => {
  it("defaultStartTime 取下一个整点（跨小时、分钟归零）", () => {
    expect(defaultStartTime(NOW).toISOString()).toBe(new Date("2026-09-11T13:00:00").toISOString());
    expect(defaultStartTime(new Date("2026-09-11T23:10:00")).getDate()).toBe(12);
    // 已经是整点也要往后推一小时，不能原地不动
    expect(defaultStartTime(new Date("2026-09-11T13:00:00")).getHours()).toBe(14);
  });

  it("defaultEndTime 是开始日 + 7 天的 23:59", () => {
    const start = new Date("2026-09-11T13:00:00");
    const end = defaultEndTime(start);
    expect(end.getDate()).toBe(18);
    expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 0]);
  });

  it("快捷胶囊 1 周 / 2 周 / 1 个月都是 23:59", () => {
    const start = new Date("2026-09-11T13:00:00");
    expect(presetEndTime(start, "1w").getDate()).toBe(18);
    expect(presetEndTime(start, "2w").getDate()).toBe(25);
    // 30 天跨月：09-11 + 30 = 10-11
    expect(presetEndTime(start, "1m").getMonth()).toBe(9);
    expect(presetEndTime(start, "1m").getDate()).toBe(11);
    for (const preset of ["1w", "2w", "1m"] as const) {
      expect(presetEndTime(start, preset).getHours()).toBe(23);
      expect(presetEndTime(start, preset).getMinutes()).toBe(59);
    }
  });
});

describe("completionRate", () => {
  it("按 已提交 / 应提交 计算，而不是直接用后端 submissionProgress", () => {
    expect(completionRate(12, 8)).toBeCloseTo(8 / 12);
    expect(completionRate(4, 1)).toBe(0.25);
  });

  /*
   * 回归：`need === 0` 曾经返回 1（只为避免除零），界面上就成了「完成率 100%」。
   * 一件没有任何人需要提交的任务没有完成率可言，100% 会被读成"全都交了"。
   * 现在返回 `null` 表示"不适用"，由 `formatRate` 渲染成 `—`。
   */
  it("应提交为 0 时返回 null（不适用），不再假报 100%", () => {
    expect(completionRate(0, 0)).toBeNull();
    expect(completionRate(null, null)).toBeNull();
    expect(completionRate(undefined, 3)).toBeNull();
    expect(completionRate(-5, 2)).toBeNull();
  });

  it("脏数据不外溢：超额夹到 1，负数夹到 0", () => {
    expect(completionRate(3, 5)).toBe(1);
    expect(completionRate(3, -1)).toBe(0);
  });
});

describe("formatRate", () => {
  it("不适用显示 —，其余取整百分比", () => {
    // `—` 与 `0%` 必须区分：前者是"没人需要交"，后者是"有人要交但一个都没交"
    expect(formatRate(null)).toBe("—");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(8 / 12)).toBe("67%");
    expect(formatRate(1)).toBe("100%");
  });
});

describe("formatTaskWindow", () => {
  it("渲染成 09-10 10:00 – 09-18 23:59", () => {
    expect(formatTaskWindow(WINDOW.startTime, WINDOW.endTime)).toBe("09-10 10:00 – 09-18 23:59");
  });

  it("缺值用 — 占位", () => {
    expect(formatTaskWindow(null, null)).toBe("— – —");
  });
});
