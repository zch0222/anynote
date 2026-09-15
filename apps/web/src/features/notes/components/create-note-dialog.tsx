"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type CreateNoteInput, createNoteSchema } from "@/features/notes/schemas";
import { useCreateNoteMutation } from "@/features/notes/use-create-note";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { toUserMessage } from "@/lib/api/errors";
import { zodResolver } from "@hookform/resolvers/zod";
import { Library, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

/**
 * 在指定知识库下新建笔记，创建成功后直接进入编辑页。
 *
 * `trigger` 是触发元素的**内容**而不是元素本身：`DialogTrigger` 自己渲染那个可点
 * 元素，在这里再套 `<button>` 会形成非法嵌套，浏览器把内层提出来后点击就落不到
 * 触发器上（对话框打不开）。
 */
export function CreateNoteDialog({
  knowledgeBaseId,
  trigger,
  triggerClassName,
  triggerLabel,
  triggerTestId,
}: {
  knowledgeBaseId: number;
  trigger?: ReactNode | undefined;
  triggerClassName?: string | undefined;
  triggerLabel?: string | undefined;
  triggerTestId?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const create = useCreateNoteMutation();
  // 归属提示胶囊要报库名（D-04 ①3）。详情多半已在缓存里（用户是从这个库的
  // 列表页点进来的），所以这次查询通常不会产生请求
  const base = useKnowledgeBaseQuery(knowledgeBaseId);
  const baseName = base.data?.knowledgeBaseName?.trim() || "当前知识库";
  const form = useForm<CreateNoteInput>({
    resolver: zodResolver(createNoteSchema),
    defaultValues: { title: "" },
  });

  /**
   * 关闭时的统一善后：清空表单（D-04 ①7）。
   *
   * 「取消」与右上角 × / Esc 走的是同一条路径——只让 × 清空、取消不清空的话，
   * 下次打开还留着上次写了一半的标题，看着像"已经建过了"。
   */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) form.reset();
    },
    [form],
  );

  async function onSubmit(values: CreateNoteInput) {
    try {
      const noteId = await create.mutateAsync({ knowledgeBaseId, title: values.title });
      toast.success("笔记已创建");
      setOpen(false);
      form.reset();
      router.push(`/notes/${knowledgeBaseId}/${noteId}`);
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        aria-label={triggerLabel}
        data-testid={triggerTestId}
        className={triggerClassName}
        nativeButton={!trigger}
        render={trigger ? <div /> : <Button />}
      >
        {trigger ?? (
          <>
            <Plus className="size-4" aria-hidden="true" />
            新建笔记
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>新建笔记</DialogTitle>
            <DialogDescription>先取个标题，正文可以随后再写。</DialogDescription>
          </DialogHeader>
          {/*
            归属提示胶囊（D-04 ①3）。它回答的是"这篇会进哪个库"——
            对话框里既不显示当前库名、也没有选库入口，不说的话用户只能猜。
            用 `bg-fill` 底而不是 accent：它是说明，不是可点的筛选器。
          */}
          <p
            data-testid="create-note-base-hint"
            className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-fill-hover px-2.5 text-footnote text-label-secondary"
          >
            <span>创建到</span>
            <Library className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate font-medium text-label">{baseName}</span>
          </p>
          <div className="space-y-2">
            <Label htmlFor="note-title">标题</Label>
            <Input id="note-title" autoComplete="off" {...form.register("title")} />
            {form.formState.errors.title ? (
              <p className="text-xs text-danger">{form.formState.errors.title.message}</p>
            ) : null}
          </div>
          <DialogFooter>
            {/*
              「取消」在「创建」左边（D-04 ①7）：主按钮在最右是全局页脚规格，
              而且取消键排在 DOM 前面，基座 Dialog 的初始焦点自然落在它身上，
              回车不会直接建出一篇标题还没填的笔记。
            */}
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "创建中…" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
