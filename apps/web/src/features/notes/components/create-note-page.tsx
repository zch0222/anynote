"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { coverAvatarClassName } from "@/features/notes/lib/cover-gradient";
import {
  type CreateNoteInput,
  type KnowledgeBase,
  createNoteSchema,
} from "@/features/notes/schemas";
import { useCreateNoteMutation } from "@/features/notes/use-create-note";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Library } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CreateBaseDialog } from "./create-base-dialog";

/**
 * `/notes/new`：命令面板与侧栏的「创建笔记」落到这里。
 *
 * 版式对齐设计稿：归属知识库是一排**可选的卡片**（渐变缩略图 + 名字 + 选中勾），
 * 而不是下拉框——选库是这一步唯一的决策，值得占视觉重心。
 *
 * 后端要求笔记必须归属一个知识库，所以还没有任何知识库时引导先建库，
 * 避免提交后才被后端打回。
 */
export function CreateNotePage({ initialBaseId }: { initialBaseId?: number | undefined } = {}) {
  const router = useRouter();
  const bases = useKnowledgeBasesQuery();
  const create = useCreateNoteMutation();
  const [selectedBaseId, setSelectedBaseId] = useState<number | null>(initialBaseId ?? null);
  const form = useForm<CreateNoteInput>({
    resolver: zodResolver(createNoteSchema),
    defaultValues: { title: "" },
  });

  const baseList = bases.data ?? [];
  // 传了 baseId 就用它；否则默认第一个库（用户多半只有一个）
  const effectiveBaseId = selectedBaseId ?? baseList[0]?.id ?? null;

  async function onSubmit(values: CreateNoteInput) {
    if (effectiveBaseId === null) {
      toast.error("请先选择一个知识库");
      return;
    }
    try {
      const noteId = await create.mutateAsync({
        knowledgeBaseId: effectiveBaseId,
        title: values.title,
      });
      toast.success("笔记已创建");
      router.push(`/notes/${effectiveBaseId}/${noteId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败，请稍后重试");
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6" data-testid="create-note-page">
      <header className="space-y-1">
        <h1 className="text-title text-label">新建笔记</h1>
        <p className="text-footnote text-label-secondary">
          选择归属的知识库，起个标题就可以开始写了。
        </p>
      </header>

      {bases.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton key={key} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : bases.isError ? (
        <p role="alert" className="rounded-lg bg-danger/5 p-6 text-footnote text-danger">
          知识库加载失败：{bases.error.message}
        </p>
      ) : baseList.length === 0 ? (
        <div className="rounded-lg border border-dashed border-separator p-10 text-center">
          <Library className="mx-auto size-8 text-label-tertiary" aria-hidden="true" />
          <p className="mt-3 text-headline text-label">还没有知识库</p>
          <p className="mt-1 text-footnote text-label-secondary">
            笔记必须归属一个知识库，先创建一个。
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <CreateBaseDialog
              onCreated={(baseId) => setSelectedBaseId(baseId)}
              redirectOnCreated={false}
            />
            <Button variant="ghost" render={<Link href="/notes" />}>
              返回知识库
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-footnote font-medium text-label">归属知识库</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {baseList.map((base) => (
                <BaseOption
                  key={base.id}
                  base={base}
                  selected={base.id === effectiveBaseId}
                  onSelect={() => setSelectedBaseId(base.id)}
                />
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="note-title">标题</Label>
            <Input
              id="note-title"
              autoComplete="off"
              placeholder="3-15 个字符"
              {...form.register("title")}
            />
            {form.formState.errors.title ? (
              <p className="text-xs text-danger">{form.formState.errors.title.message}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "创建中…" : "创建笔记"}
            </Button>
            <Button type="button" variant="ghost" render={<Link href="/notes" />}>
              取消
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function BaseOption({
  base,
  selected,
  onSelect,
}: {
  base: KnowledgeBase;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid={`base-option-${base.id}`}
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "bg-accent-soft ring-1 ring-accent" : "bg-surface shadow-card hover:bg-grouped",
      )}
    >
      <span className={coverAvatarClassName(base.id, "size-8 rounded-md")} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-footnote text-label">
        {base.knowledgeBaseName?.trim() || "未命名知识库"}
      </span>
      <Check
        className={cn("size-4 shrink-0", selected ? "text-accent" : "text-transparent")}
        aria-hidden="true"
      />
    </button>
  );
}
