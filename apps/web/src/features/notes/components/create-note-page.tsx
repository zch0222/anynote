"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type CreateNoteInput,
  type KnowledgeBase,
  createNoteSchema,
} from "@/features/notes/schemas";
import { useCreateNoteMutation } from "@/features/notes/use-create-note";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Library } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CreateBaseDialog } from "./create-base-dialog";

/**
 * `/notes/new`：命令面板与侧栏的「创建笔记」落到这里。
 *
 * 后端要求笔记必须归属一个知识库，所以先选库再起标题；
 * 还没有任何知识库时引导先建库，避免提交后才被后端打回。
 */
export function CreateNotePage() {
  const router = useRouter();
  const bases = useKnowledgeBasesQuery();
  const create = useCreateNoteMutation();
  const [selectedBaseId, setSelectedBaseId] = useState<number | null>(null);
  const form = useForm<CreateNoteInput>({
    resolver: zodResolver(createNoteSchema),
    defaultValues: { title: "" },
  });

  const baseList = bases.data ?? [];
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
    <section className="mx-auto w-full max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">创建笔记</h1>
        <p className="text-sm text-muted-foreground">选择归属的知识库，起个标题就可以开始写了。</p>
      </div>

      {bases.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : bases.isError ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          知识库加载失败：{bases.error.message}
        </p>
      ) : baseList.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Library className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">还没有知识库</p>
          <p className="mt-1 text-sm text-muted-foreground">笔记必须归属一个知识库，先创建一个。</p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <CreateBaseDialog onCreated={(baseId) => setSelectedBaseId(baseId)} />
            <Button variant="ghost" render={<Link href="/notes" />}>
              返回笔记首页
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">归属知识库</legend>
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
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
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
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:border-primary/40",
      )}
    >
      <Library className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{base.knowledgeBaseName ?? "未命名知识库"}</span>
      <FileText
        className={cn("ml-auto size-4 shrink-0", selected ? "text-primary" : "text-transparent")}
        aria-hidden="true"
      />
    </button>
  );
}
