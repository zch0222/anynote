"use client";

import { isMobilePath } from "@/components/layout/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { type CreateBaseInput, createBaseSchema } from "@/features/notes/schemas";
import { useCreateKnowledgeBaseMutation } from "@/features/notes/use-knowledge-bases";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export type CreateBaseDialogProps = {
  onCreated?: ((baseId: number) => void) | undefined;
  /**
   * 自定义触发元素的**内容**。
   *
   * 注意传的是内容不是元素本身：`DialogTrigger` 会自己渲染那个可点元素
   * （`render` 只用来换标签类型与类名）。若在这里再套一个 `<button>`，
   * 就会得到 `<button><button>…` —— HTML 不允许嵌套按钮，浏览器会把内层
   * 提到外面，点击落到外层上，对话框永远打不开。
   */
  trigger?: ReactNode | undefined;
  /** 传给触发元素的类名（自定义内容时几乎总要给）。 */
  triggerClassName?: string | undefined;
  /** 触发元素的无障碍名称；内容只有图标时必填。 */
  triggerLabel?: string | undefined;
  /** 触发元素的 `data-testid`。 */
  triggerTestId?: string | undefined;
  /** 初始展开（画廊页从 `?new=1` 读出来传进来）。 */
  defaultOpen?: boolean | undefined;
  /** 创建成功后是否跳到新库；画廊与侧栏都要跳，移动端列表页也一致。 */
  redirectOnCreated?: boolean | undefined;
};

/**
 * 新建知识库：笔记必须挂在知识库下，没有知识库时这里是唯一入口。
 *
 * 成功后默认跳进新库——用户的下一步一定是"往里加东西"，
 * 留在画廊看新卡片是多余的一步。
 */
export function CreateBaseDialog({
  onCreated,
  trigger,
  triggerClassName,
  triggerLabel,
  triggerTestId,
  defaultOpen = false,
  redirectOnCreated = true,
}: CreateBaseDialogProps = {}) {
  const [open, setOpen] = useState(defaultOpen);
  const router = useRouter();
  const pathname = usePathname();
  const create = useCreateKnowledgeBaseMutation();
  const form = useForm<CreateBaseInput>({
    resolver: zodResolver(createBaseSchema),
    defaultValues: { name: "", detail: "" },
  });

  async function onSubmit(values: CreateBaseInput) {
    try {
      const baseId = await create.mutateAsync(values);
      toast.success("知识库已创建");
      setOpen(false);
      form.reset();
      onCreated?.(baseId);
      // 跳转要跟着**当前所在版式**走：在 `/m/*` 下创作却跳到 `/notes/:id`
      // 会把人从移动端布局扔进桌面布局（同一个知识库，两套壳）。
      if (redirectOnCreated) {
        router.push(isMobilePath(pathname) ? `/m/notes/${baseId}` : `/notes/${baseId}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败，请稍后重试");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      {/*
        `trigger` 是内容不是元素：`DialogTrigger` 自己渲染那个可点元素。
        自定义内容时换成 `<div>` 并把 `nativeButton` 关掉——Base UI 在
        `nativeButton: true`（默认）下会按原生 `<button>` 处理，把 `render` 换成
        `div` 后点击不再冒泡到触发器，表现为"按钮点不开"。
      */}
      <DialogTrigger
        aria-label={triggerLabel}
        data-testid={triggerTestId}
        className={triggerClassName}
        nativeButton={!trigger}
        render={trigger ? <div /> : <Button variant="outline" />}
      >
        {trigger ?? (
          <>
            <Plus className="size-4" aria-hidden="true" />
            新建知识库
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>新建知识库</DialogTitle>
            <DialogDescription>知识库是笔记的归属容器，先建一个再开始写作。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="base-name">名称</Label>
            <Input id="base-name" autoComplete="off" {...form.register("name")} />
            {form.formState.errors.name ? (
              <p className="text-xs text-danger">{form.formState.errors.name.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="base-detail">简介</Label>
            <Textarea id="base-detail" rows={3} {...form.register("detail")} />
            {form.formState.errors.detail ? (
              <p className="text-xs text-danger">{form.formState.errors.detail.message}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "创建中…" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
