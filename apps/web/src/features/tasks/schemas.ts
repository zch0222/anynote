import { pageBeanSchema } from "@/features/ai/schemas";
import { z } from "zod";

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

/** 我的提交状态文案（后端 MemberNoteTaskStatusEnum；未知值原样兜底）。 */
export function submissionStatusText(status: number | null | undefined): string {
  switch (status) {
    case 0:
      return "未提交";
    case 1:
      return "已提交";
    case 2:
      return "已退回";
    default:
      return "未知";
  }
}

/** 任务时间窗是否仍然开放（结束时间已过则不可再提交）。 */
export function isTaskOpen(endTime: string | null | undefined, now = new Date()): boolean {
  if (!endTime) {
    return true;
  }
  const end = Date.parse(endTime);
  return Number.isNaN(end) ? true : end >= now.getTime();
}

export const submitTaskSchema = z.object({
  noteId: z.number({ message: "请选择要提交的笔记" }).positive(),
  noteTaskId: z.number().positive(),
});
