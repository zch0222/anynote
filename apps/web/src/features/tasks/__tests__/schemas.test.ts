import {
  TASK_STATUS,
  isTaskOpen,
  memberTaskSchema,
  submissionStatusBadgeVariant,
  submissionStatusText,
  submitTaskSchema,
} from "@/features/tasks/schemas";
import { describe, expect, it } from "vitest";

describe("tasks schemas", () => {
  /**
   * 回归用例（§1.4 第 2 条）：这里原来把 2 写成「已退回」。
   * 后端 `UserNoteTaskStatus` 是 0 未提交 / 1 已提交 / 2 无需提交 / 3 已退回，
   * 成员侧与管理侧读的是同一列，不存在"两套枚举"。写错会让被退回的成员
   * 看不到「重新提交」（后端给的是 3），而本库管理员那一行被显示成已退回。
   */
  it("提交状态文案映射：3 = 已退回、2 = 无需提交（未知值兜底）", () => {
    expect(submissionStatusText(0)).toBe("未提交");
    expect(submissionStatusText(1)).toBe("已提交");
    expect(submissionStatusText(2)).toBe("无需提交");
    expect(submissionStatusText(3)).toBe("已退回");
    expect(submissionStatusText(99)).toBe("未知");
    expect(submissionStatusText(null)).toBe("未知");
  });

  it("状态枚举取值与后端 UserNoteTaskStatus 对齐", () => {
    expect(TASK_STATUS).toEqual({
      NOT_SUBMITTED: 0,
      SUBMITTED: 1,
      NO_SUBMISSION_REQUIRED: 2,
      RETURNED: 3,
    });
  });

  /**
   * `status === 2` 是知识库管理员自己（无需提交），列表上不画徽标也不出操作。
   * 变体名直接用 `Badge` 的取值，`danger` 这个语义色在 `Badge` 里叫 `destructive`
   * （渲染出来就是 `bg-danger/12 text-danger`），不在中间再翻译一层。
   */
  it("状态徽标配色：0 warning / 1 success / 3 destructive；2 与未知状态不返回徽标", () => {
    expect(submissionStatusBadgeVariant(0)).toBe("warning");
    expect(submissionStatusBadgeVariant(1)).toBe("success");
    expect(submissionStatusBadgeVariant(3)).toBe("destructive");
    expect(submissionStatusBadgeVariant(2)).toBeNull();
    expect(submissionStatusBadgeVariant(null)).toBeNull();
    expect(submissionStatusBadgeVariant(99)).toBeNull();
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
