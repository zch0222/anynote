"use client";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatTaskMoment, taskPhase } from "@/features/tasks/lib/task-window";
import { type TaskSubmission, submissionDisplayName } from "@/features/tasks/schemas";
import { useReturnSubmissionMutation } from "@/features/tasks/use-task-mutations";
import { toUserMessage } from "@/lib/api/errors";
import { toast } from "sonner";

/**
 * 退回一份提交（D-17 ②，图例 24–27）。
 *
 * 文案把**后果与截止时间**一起说清（图例 25）：旧文案「确定要退回任务吗？」
 * 只描述了动作。成员被退回后是"可以改一改再交"还是"已经没机会了"，
 * 完全取决于任务有没有截止——这一句必须随窗口状态变。
 *
 * 已截止时仍然允许退回（后端不阻止），但成员**无法**再提交，
 * 所以文案要明确说"TA 将无法重新提交"，不能让管理员误以为对方还能补交。
 */
export function ReturnSubmissionDialog({
  open,
  onOpenChange,
  submission,
  endTime,
  now,
  onReturned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: TaskSubmission | null;
  /** 任务截止时间：文案里要写出来，用来算"还能不能重新提交"。 */
  endTime: string | null | undefined;
  now: Date;
  onReturned?: (() => void) | undefined;
}) {
  const returned = useReturnSubmissionMutation(submission?.noteTaskId ?? 0);
  const closed = taskPhase(null, endTime, now) === "closed";
  const name = submission ? submissionDisplayName(submission) : "这位成员";

  const handleConfirm = async () => {
    if (!submission) return;
    try {
      await returned.mutateAsync(submission.id);
      toast.success("已退回");
      onOpenChange(false);
      onReturned?.();
    } catch (error) {
      // 失败不关对话框：关掉之后用户看不到原因，只会以为退回成功了
      toast.error(toUserMessage(error));
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="danger"
      title="退回这份提交？"
      description={
        closed
          ? `${name} 的提交会变成「已退回」。任务已截止，退回后 TA 将无法重新提交。`
          : `${name} 的提交会变成「已退回」，TA 可以在 ${formatTaskMoment(endTime)} 之前重新提交。`
      }
      confirmLabel="退回"
      pendingLabel="退回中…"
      pending={returned.isPending}
      onConfirm={() => void handleConfirm()}
    />
  );
}
