"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { taskDetailHref } from "@/components/layout/navigation";
import { Spinner } from "@/components/loading/spinner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import {
  type PresetDuration,
  defaultEndTime,
  defaultStartTime,
  presetEndTime,
} from "@/features/tasks/lib/task-window";
import { type TaskFormInput, taskFormSchema } from "@/features/tasks/schemas";
import { useAdminTaskQuery } from "@/features/tasks/use-task-detail";
import { useCreateTaskMutation, useUpdateTaskMutation } from "@/features/tasks/use-task-mutations";
import { toUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { ChevronLeft, Library } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DateTimeField } from "./date-time-field";

/** 表单字段的 DOM id。提交失败要按"第一个出错字段"聚焦，得能按名字把元素找回来。 */
const NAME_FIELD_ID = "task-name";
const START_FIELD_ID = "task-start";
const END_FIELD_ID = "task-end";

/** 快捷胶囊（D-18 图例 8）：多数任务就是这几种时长。 */
const PRESETS: ReadonlyArray<{ value: PresetDuration; label: string }> = [
  { value: "1w", label: "1 周" },
  { value: "2w", label: "2 周" },
  { value: "1m", label: "1 个月" },
];

type FormErrors = Partial<Record<keyof TaskFormInput, string>>;

export type TaskFormPageProps = {
  baseId: number;
  mode: "new" | "edit";
  /** 编辑模式必传；新建模式忽略。 */
  taskId?: number;
};

/**
 * `/notes/:baseId/tasks/new` 与 `/notes/:baseId/tasks/:taskId/edit`（D-18）。
 *
 * 两种模式共用一套版式，差异只有四处：标题、返回目标、预填、提交动词。
 * 拆成两个组件会让这四处差异散落到两份几乎相同的 JSX 里，改设计稿时要改两遍。
 *
 * 几个刻意的取舍：
 * 1. **不用 react-hook-form，手写 `useState` + `taskFormSchema.safeParse`**。
 *    这里的"脏"判定要比较 `Date`（值相等而非引用相等），预填又必须**只做一次**
 *    （编辑数据到达后用户已经开始改，再回灌就会吞掉输入）。这两件事在受控的
 *    原生 state 里是几行显式代码，套上表单库反而要绕开它的 reset 语义。
 * 2. **校验失败不弹 toast**，就地描红并滚到第一个出错字段（图例 11）。
 *    toast 会飘在角落、几秒后消失，用户还得回头找哪个字段错了。
 * 3. **提交中整表单只读**（图例 15）：请求飞行时改动输入，成功回跳后这次改动
 *    既没提交也没留存，用户会以为"我改了怎么没生效"。
 *
 * 已知偏差：图例 9 要求工具条为「粗体 / 斜体 / H2 / 无序 / 有序 / 链接」，
 * 而 `TiptapEditor` 的 `minimal` 预设用的是 `MINIMAL_LAYOUT`
 * （undo/redo/bold/italic/underline/strike/code/highlight/link/bulletList/orderedList/clearFormat），
 * **不含 H2**、且多了几个设计稿没画的按钮。`components/editor/**` 属其他工作流，
 * 此处按现有预设渲染，不加 `toolbar` 覆写。差异留给编辑器侧统一收口。
 */
export function TaskFormPage({ baseId, mode, taskId }: TaskFormPageProps) {
  const router = useRouter();
  const base = useKnowledgeBaseQuery(baseId);
  const isEdit = mode === "edit";
  // 新建模式下传 0：hook 内部 `enabled` 会挡住请求，这里只是为了不违反 hooks 调用顺序
  const adminTask = useAdminTaskQuery(isEdit ? (taskId ?? 0) : 0);
  const createTask = useCreateTaskMutation();
  const updateTask = useUpdateTaskMutation();

  const [values, setValues] = useState<TaskFormInput>(() => {
    const start = defaultStartTime(new Date());
    return { taskName: "", startTime: start, endTime: defaultEndTime(start), taskDescribe: "" };
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [leaveOpen, setLeaveOpen] = useState(false);

  /**
   * 初始值快照（Dirty 判定的基准）。
   *
   * 与 `values` 分开存是有意的：预填发生在数据到达时，快照必须跟着一起换，
   * 否则"编辑页一打开就是脏的"，用户还没动手就被拦一次离开确认。
   */
  const initialRef = useRef<TaskFormInput>(values);
  /** 预填只做一次的闸门。 */
  const prefilledRef = useRef(false);
  /** 提交成功后要跳走，此时不该再拦"未保存"。 */
  const submittedRef = useRef(false);

  const pending = createTask.isPending || updateTask.isPending;
  const dirty =
    values.taskName !== initialRef.current.taskName ||
    values.taskDescribe !== initialRef.current.taskDescribe ||
    values.startTime.getTime() !== initialRef.current.startTime.getTime() ||
    values.endTime.getTime() !== initialRef.current.endTime.getTime();

  /**
   * 编辑模式预填（图例 14）。
   *
   * 只在数据**首次**到达时灌一次：`prefilledRef` 挡住后续的重取
   * （mutation 成功会失效 `tasks` 域，详情会重新拉一遍）。
   */
  useEffect(() => {
    if (!isEdit || prefilledRef.current) return;
    const task = adminTask.data;
    if (!task) return;
    prefilledRef.current = true;

    const start = parseIsoOr(task.startTime, () => defaultStartTime(new Date()));
    const end = parseIsoOr(task.endTime, () => defaultEndTime(start));
    const next: TaskFormInput = {
      taskName: task.taskName ?? "",
      startTime: start,
      endTime: end,
      taskDescribe: task.taskDescribe ?? "",
    };
    initialRef.current = next;
    setValues(next);
  }, [isEdit, adminTask.data]);

  /** 有改动就拦浏览器关闭 / 刷新（站内跳转由 ConfirmDialog 负责）。 */
  useEffect(() => {
    if (!dirty || submittedRef.current) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  /**
   * 非管理员访问直接回任务 Tab（§12.1.1 第 3 点）。
   *
   * 只在**拿到过** `permissions` 之后判定：`data` 还没到就跳会把管理员也误伤。
   */
  const permissions = base.data?.permissions;
  const forbidden = permissions !== undefined && permissions !== null && permissions !== 1;
  useEffect(() => {
    if (!forbidden) return;
    toast.error("只有知识库管理员可以发布任务");
    router.replace(`/notes/${baseId}/tasks`);
  }, [forbidden, baseId, router]);

  const leaveHref = isEdit && taskId ? taskDetailHref(baseId, taskId) : `/notes/${baseId}/tasks`;
  const backLabel = isEdit ? "任务详情" : "任务";

  /** 「‹ 任务」与「取消」共用一个出口：有改动先问，没改动直接走。 */
  const requestLeave = useCallback(() => {
    if (dirty && !submittedRef.current) {
      setLeaveOpen(true);
      return;
    }
    router.push(leaveHref);
  }, [dirty, leaveHref, router]);

  function updateField<K extends keyof TaskFormInput>(key: K, value: TaskFormInput[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
    // 用户一动手就把这个字段的旧错误撤掉，否则描红会一直挂到下次提交
    setErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous));
  }

  /** 按表单从上到下的顺序聚焦第一个出错字段。顺序写死在这里，与 JSX 的排列一致。 */
  function focusFirstError(next: FormErrors) {
    const order: Array<keyof TaskFormInput> = ["taskName", "endTime"];
    const first = order.find((key) => next[key]);
    const id = first === "taskName" ? NAME_FIELD_ID : first === "endTime" ? END_FIELD_ID : null;
    if (!id) return;
    const element = document.getElementById(id);
    if (!element) return;
    // jsdom 不实现 scrollIntoView，不能无条件调用
    if (typeof element.scrollIntoView === "function") element.scrollIntoView({ block: "center" });
    element.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const parsed = taskFormSchema.safeParse(values);
    if (!parsed.success) {
      const next: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof TaskFormInput | undefined;
        // 同一字段多条错误只显示第一条：一列描红里堆两句话没人读
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      focusFirstError(next);
      return;
    }

    setErrors({});
    try {
      if (isEdit && taskId) {
        await updateTask.mutateAsync({ taskId, ...parsed.data });
        submittedRef.current = true;
        toast.success("已保存");
        router.push(taskDetailHref(baseId, taskId));
        return;
      }
      const created = await createTask.mutateAsync({ ...parsed.data, knowledgeBaseId: baseId });
      submittedRef.current = true;
      toast.success("任务已发布");
      router.push(taskDetailHref(baseId, created.id));
    } catch (error) {
      // 保留输入：失败后让用户接着改，而不是从头再填一遍
      toast.error(toUserMessage(error));
    }
  }

  // 权限判定中 / 编辑数据首屏：给骨架而不是闪一下空表单
  if (forbidden) return null;
  if (isEdit && adminTask.isPending && !prefilledRef.current) {
    return (
      <section className="mx-auto w-full max-w-2xl space-y-6" data-testid="task-form-loading">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-[130px] w-full" />
      </section>
    );
  }

  const activePreset = PRESETS.find(
    (preset) =>
      presetEndTime(values.startTime, preset.value).getTime() === values.endTime.getTime(),
  )?.value;

  return (
    <section className="mx-auto w-full max-w-2xl space-y-6" data-testid="task-form-page">
      <header className="space-y-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 gap-1 text-accent"
          onClick={requestLeave}
          data-testid="task-form-back"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />‹ {backLabel}
        </Button>
        <h1 className="text-display text-label">{isEdit ? "编辑任务" : "新建任务"}</h1>
        <p className="text-body text-label-secondary">
          {isEdit
            ? "修改会立即对本库成员生效，已有的提交记录不受影响。"
            : "发布后，本库成员会在「任务」里看到它，并在时间窗口内提交一篇笔记。"}
        </p>
      </header>

      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div
          className="flex h-9 items-center gap-1.5 rounded-md bg-fill-hover px-3 text-footnote"
          data-testid="task-form-base"
        >
          <span className="text-label-secondary">发布到</span>
          <Library className="size-4 text-label-secondary" aria-hidden="true" />
          {base.isPending ? (
            <Skeleton className="h-4 w-28" />
          ) : (
            <span className="text-label">{base.data?.knowledgeBaseName ?? "未命名知识库"}</span>
          )}
        </div>

        <Field data-invalid={Boolean(errors.taskName)}>
          <FieldLabel htmlFor={NAME_FIELD_ID}>任务名称</FieldLabel>
          <div className="relative">
            <Input
              id={NAME_FIELD_ID}
              className="h-9 pr-16"
              autoFocus
              required
              maxLength={20}
              disabled={pending}
              placeholder="例如：本周读书笔记"
              aria-invalid={Boolean(errors.taskName)}
              value={values.taskName}
              onChange={(event) => updateField("taskName", event.target.value)}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-label-tertiary tabular-nums">
              {values.taskName.length} / 20
            </span>
          </div>
          <FieldError>{errors.taskName}</FieldError>
        </Field>

        <div className="space-y-3">
          <Field>
            {/* 日期字段自己不接受 label 关联（触发器是 button，已带 aria-label），
                所以这里不写 htmlFor，避免点标签触发浮层 */}
            <FieldLabel>开始时间</FieldLabel>
            <DateTimeField
              id={START_FIELD_ID}
              label="开始时间"
              value={values.startTime}
              disabled={pending}
              onChange={(next) => updateField("startTime", next)}
            />
          </Field>

          <Field data-invalid={Boolean(errors.endTime)}>
            <FieldLabel>截止时间</FieldLabel>
            <DateTimeField
              id={END_FIELD_ID}
              label="截止时间"
              value={values.endTime}
              disabled={pending}
              invalid={Boolean(errors.endTime)}
              onChange={(next) => updateField("endTime", next)}
            />
            <FieldError>{errors.endTime}</FieldError>
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                disabled={pending}
                aria-pressed={activePreset === preset.value}
                onClick={() =>
                  updateField("endTime", presetEndTime(values.startTime, preset.value))
                }
                className={cn(
                  "h-[26px] rounded-full px-3 text-xs transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  "disabled:pointer-events-none disabled:opacity-50",
                  activePreset === preset.value
                    ? "bg-accent-soft text-accent"
                    : "text-label-secondary hover:bg-fill-hover",
                )}
              >
                {preset.label}
              </button>
            ))}
            <span className="text-xs text-label-tertiary">成员只能在时间窗口内提交</span>
          </div>
        </div>

        <Field>
          {/* 描述是 contenteditable 画布，没有可关联的表单控件，
              所以这里只是视觉标签、不写 htmlFor（写了会指向一个不存在的 id） */}
          <FieldLabel>任务描述</FieldLabel>
          <div className="min-h-[130px] rounded-md border border-separator px-2.5 py-2">
            <TiptapEditor
              preset="minimal"
              value={values.taskDescribe}
              editable={!pending}
              placeholder="补充任务要求、提交格式等（选填）"
              onChange={(markdown) => updateField("taskDescribe", markdown)}
            />
          </div>
        </Field>

        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" className="h-9" disabled={pending}>
            {pending ? (
              <>
                <Spinner size="button" />
                {isEdit ? "保存中…" : "发布中…"}
              </>
            ) : isEdit ? (
              "保存修改"
            ) : (
              "发布任务"
            )}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={requestLeave}>
            取消
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="放弃未保存的修改？"
        description="离开后本次填写的内容不会保留。"
        confirmLabel="放弃修改"
        tone="danger"
        onConfirm={() => {
          setLeaveOpen(false);
          submittedRef.current = true;
          router.push(leaveHref);
        }}
      />
    </section>
  );
}

/**
 * ISO 串 → `Date`，坏值走兜底。
 *
 * 后端字段全是 `nullish`，且格式坏掉时 `new Date(...)` 会给出 `Invalid Date`——
 * 那种值一旦进了 `taskFormSchema`（`z.date()` 不挡 Invalid Date 的 `getTime()` 为 NaN，
 * 但 `endTime > startTime` 的比较会永远为 false），用户会卡在一个改不动的截止时间上。
 */
function parseIsoOr(value: string | null | undefined, fallback: () => Date): Date {
  if (!value) return fallback();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback() : parsed;
}
