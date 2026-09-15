import { pageBeanSchema } from "@/features/ai/schemas";
import { z } from "zod";

/**
 * 任务域的状态枚举，与后端 `UserNoteTaskStatus`（`services/note/.../enums/UserNoteTaskStatus.java`）
 * 一一对应。
 *
 * 成员端 `submissionStatus` 与管理端 `userTaskStatus` 读的是同一列
 * `n_user_note_task.status`，**不存在两套枚举**。这里在 2026-09-16 之前把 2 写成
 * 「已退回」是前端 bug：真值 2 是"无需提交"（知识库管理员自己），3 才是"已退回"。
 * 写错的两个可见后果——被退回的成员看不到「重新提交」，
 * 而管理员自己那一行被显示成已退回。
 */
export const TASK_STATUS = {
  NOT_SUBMITTED: 0,
  SUBMITTED: 1,
  NO_SUBMISSION_REQUIRED: 2,
  RETURNED: 3,
} as const;

/** 会员任务列表行（note 域 /noteTasks，MemberNoteTaskDTO 白名单）。 */
export const memberTaskSchema = z.object({
  id: z.number(),
  taskName: z.string().nullish(),
  taskDescribe: z.string().nullish(),
  startTime: z.string().nullish(),
  endTime: z.string().nullish(),
  status: z.number().nullish(),
  submissionStatus: z.number().nullish(),
  submissionNoteId: z.number().nullish(),
  submitTime: z.string().nullish(),
  taskCreatorNickname: z.string().nullish(),
});
export type MemberTask = z.infer<typeof memberTaskSchema>;

export const memberTaskPageSchema = pageBeanSchema(memberTaskSchema);

/**
 * 管理员任务详情（note 域 `GET /admin/noteTasks/{id}`，AdminNoteTaskVO）。
 *
 * `submissionProgress` 只在 `needSubmitCount === 0` 时是 `100.0`（百分比），
 * 其余时候是 0–1 的小数（`NoteTaskServiceImpl#getAdminNoteTaskInfo`）。
 * 两套量纲混在一个字段里，所以界面上的完成率一律走 `lib/task-window.ts` 的
 * `completionRate(need, submitted)` 现算，不直接用这个字段。
 */
export const adminTaskSchema = z.object({
  id: z.number(),
  taskName: z.string().nullish(),
  taskDescribe: z.string().nullish(),
  startTime: z.string().nullish(),
  endTime: z.string().nullish(),
  knowledgeBaseId: z.number().nullish(),
  status: z.number().nullish(),
  needSubmitCount: z.number().nullish(),
  submittedCount: z.number().nullish(),
  submissionProgress: z.number().nullish(),
});
export type AdminTask = z.infer<typeof adminTaskSchema>;

/** 管理员提交记录行（`GET /admin/noteTasks/submissions`，NoteTaskSubmissionRecordDTO）。 */
export const taskSubmissionSchema = z.object({
  id: z.number(),
  noteId: z.number().nullish(),
  noteTaskId: z.number().nullish(),
  noteTitle: z.string().nullish(),
  noteEditCount: z.number().nullish(),
  submissionNickname: z.string().nullish(),
  submissionUsername: z.string().nullish(),
  submitTime: z.string().nullish(),
  userId: z.number().nullish(),
  /** `NoteTaskSubmissionRecordStatus`：0 正常 / 1 被退回。 */
  status: z.number().nullish(),
});
export type TaskSubmission = z.infer<typeof taskSubmissionSchema>;

export const taskSubmissionPageSchema = pageBeanSchema(taskSubmissionSchema);

/** 提交记录分段控件：已提交 1 / 未提交 0 / 已退回 3（对应后端 `userTaskStatus`）。 */
export const SUBMISSION_TABS = ["submitted", "pending", "returned"] as const;
export type SubmissionTab = (typeof SUBMISSION_TABS)[number];

/** tab → 后端 `userTaskStatus`；UI 顺序（已提交在前）与设计稿图例 11 一致。 */
export const SUBMISSION_TAB_STATUS: Record<SubmissionTab, number> = {
  submitted: TASK_STATUS.SUBMITTED,
  pending: TASK_STATUS.NOT_SUBMITTED,
  returned: TASK_STATUS.RETURNED,
};

/** 提交记录每页 20（D-17 图例 11）。 */
export const SUBMISSION_PAGE_SIZE = 20;

/**
 * 成员编辑活跃度热力图（B-1 `GET /admin/noteTasks/{id}/editHeatmap`）。
 *
 * `today` 由**服务端**给出：客户端时区与服务端不一致时，"未到"的列必须按服务端
 * 的当天算，否则会出现"最后一列明明是今天却画成未到"。
 */
export const taskHeatmapMemberSchema = z.object({
  userId: z.number().nullish(),
  username: z.string().nullish(),
  nickname: z.string().nullish(),
  noteId: z.number().nullish(),
  /** 窗口内编辑总次数，折叠排序用。 */
  total: z.number().nullish(),
  /** 与 `days` 等长，未编辑为 0。 */
  counts: z.array(z.number()).nullish(),
});
export type TaskHeatmapMember = z.infer<typeof taskHeatmapMemberSchema>;

export const taskHeatmapSchema = z.object({
  /** 全部是 `yyyy-MM-dd`。 */
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  today: z.string().nullish(),
  days: z.array(z.string()).nullish(),
  members: z.array(taskHeatmapMemberSchema).nullish(),
});
export type TaskHeatmap = z.infer<typeof taskHeatmapSchema>;

/**
 * 任务时间线（`GET /noteTasks/{id}/history`，NoteTaskHistoryVO）。
 *
 * 后端已按登录人过滤，成员看到的就是自己那条线。`type` 是
 * `NoteTaskOperationType`：1 创建 / 2 修改 / 3 提交 / 4 退回 / 5 加成员。
 */
export const taskTimelineItemSchema = z.object({
  id: z.number(),
  type: z.number().nullish(),
  operationTime: z.string().nullish(),
  noteId: z.number().nullish(),
  noteHistoryTitle: z.string().nullish(),
  operatorNickName: z.string().nullish(),
});
export type TaskTimelineItem = z.infer<typeof taskTimelineItemSchema>;

/** 时间线只显示这两种事件（D-17 图例 20「提交历史」）。 */
export const TIMELINE_SUBMIT = 3;
export const TIMELINE_RETURN = 4;

/**
 * 提交记录里那位成员的名字。
 *
 * 与 `features/notes` 的 `memberDisplayName` 是同一个口径（昵称优先、
 * 退回用户名、兜底占位），但那个函数收的是 `KnowledgeBaseMember`，
 * 这里收的是提交记录——字段名不同，共用会逼着调用方先做一次结构转换，
 * 不如各留一份四行的实现。
 */
export function submissionDisplayName(submission: {
  submissionNickname?: string | null | undefined;
  submissionUsername?: string | null | undefined;
}): string {
  return (
    submission.submissionNickname?.trim() || submission.submissionUsername?.trim() || "未命名成员"
  );
}

/**
 * 我的提交状态文案。
 *
 * 未知值不猜：`null`（后端没给）与越界值都回「未知」，让界面上出现一个明显
 * 不对劲的字符串，好过悄悄显示成某个真实状态。
 */
export function submissionStatusText(status: number | null | undefined): string {
  switch (status) {
    case TASK_STATUS.NOT_SUBMITTED:
      return "未提交";
    case TASK_STATUS.SUBMITTED:
      return "已提交";
    case TASK_STATUS.NO_SUBMISSION_REQUIRED:
      return "无需提交";
    case TASK_STATUS.RETURNED:
      return "已退回";
    default:
      return "未知";
  }
}

/**
 * 状态徽标的变体名（D-07 图例 14：0 warning / 1 success / 3 danger）。
 *
 * `2`（无需提交，就是本库管理员自己）返回 `null` 表示**不画徽标**：
 * 给管理员自己画一个"无需提交"的徽标只是噪音，那一行的操作列同样是空的。
 */
export function submissionStatusBadgeVariant(
  status: number | null | undefined,
): "warning" | "success" | "destructive" | null {
  switch (status) {
    case TASK_STATUS.NOT_SUBMITTED:
      return "warning";
    case TASK_STATUS.SUBMITTED:
      return "success";
    case TASK_STATUS.RETURNED:
      return "destructive";
    default:
      return null;
  }
}

/**
 * 任务时间窗是否仍然开放。
 *
 * 实现在 `lib/task-window.ts`（与 `taskPhase` 同一份判定），这里再导出一次
 * 是为了不改动既有 import 路径——组件一直从 `features/tasks/schemas` 取它。
 */
export { isTaskOpen } from "./lib/task-window";

export const submitTaskSchema = z.object({
  noteId: z.number({ message: "请选择要提交的笔记" }).positive(),
  noteTaskId: z.number().positive(),
});

/**
 * 任务表单（D-18）。
 *
 * 新建时后端只校验非空，但 PATCH 走同一份 `taskName` 长度约束（1–20 字），
 * 两边统一按 20 校验：否则用户能建出一个自己在编辑页存不回去的任务。
 * 截止早于开始的错误挂在 `endTime` 上——设计稿图例 13 就是给截止字段描 danger 边。
 */
export const taskFormSchema = z
  .object({
    taskName: z.string().trim().min(1, "请填写任务名称").max(20, "任务名称最多 20 个字"),
    startTime: z.date(),
    endTime: z.date(),
    taskDescribe: z.string(),
  })
  .refine((value) => value.endTime > value.startTime, {
    path: ["endTime"],
    message: "截止时间必须晚于开始时间",
  });
export type TaskFormInput = z.infer<typeof taskFormSchema>;
