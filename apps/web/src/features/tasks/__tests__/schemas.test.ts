import {
  isTaskOpen,
  memberTaskSchema,
  submissionStatusText,
  submitTaskSchema,
} from "@/features/tasks/schemas";
import { describe, expect, it } from "vitest";

describe("tasks schemas", () => {
  it("提交状态文案映射（未知值兜底）", () => {
    expect(submissionStatusText(0)).toBe("未提交");
    expect(submissionStatusText(1)).toBe("已提交");
    expect(submissionStatusText(2)).toBe("已退回");
    expect(submissionStatusText(99)).toBe("未知");
    expect(submissionStatusText(null)).toBe("未知");
  });

  it("时间窗开放判断：结束时间为空视为开放，已过期不开放", () => {
    const now = new Date("2026-09-11T12:00:00");
    expect(isTaskOpen(null, now)).toBe(true);
    expect(isTaskOpen("not-a-date", now)).toBe(true);
    expect(isTaskOpen("2026-09-11T11:00:00", now)).toBe(false);
    expect(isTaskOpen("2026-09-11T13:00:00", now)).toBe(true);
  });

  it("提交表单 schema：noteId 必须为正数", () => {
    expect(submitTaskSchema.safeParse({ noteId: 1, noteTaskId: 2 }).success).toBe(true);
    expect(submitTaskSchema.safeParse({ noteId: 0, noteTaskId: 2 }).success).toBe(false);
    expect(submitTaskSchema.safeParse({ noteId: -1, noteTaskId: 2 }).success).toBe(false);
  });

  it("任务行 schema：白名单解析（后端加字段不崩）", () => {
    const parsed = memberTaskSchema.parse({
      id: 1,
      taskName: "读书笔记",
      taskDescribe: "写一篇",
      submissionStatus: 1,
      unknownField: "ignored",
    });
    expect(parsed.taskName).toBe("读书笔记");
    expect("unknownField" in parsed).toBe(false);
  });
});
