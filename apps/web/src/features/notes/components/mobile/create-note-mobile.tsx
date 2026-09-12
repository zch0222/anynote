"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateBaseDialog } from "@/features/notes/components/create-base-dialog";
import { type CreateNoteInput, createNoteSchema } from "@/features/notes/schemas";
import { useCreateNoteMutation } from "@/features/notes/use-create-note";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Library } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

/**
 * `/m/notes/new`：移动端新建笔记。
 *
 * 与桌面同一套 hooks 与 schema，差别只有两处：
 * 1. 知识库选择是单列可点行（桌面是两列卡片），触摸目标 56px
 * 2. 创建成功后跳 `/m/notes/...` 而不是桌面地址
 *
 * 从笔记列表点"+"进来时带 `?baseId=`，直接预选当前知识库，少点一次。
 */
export function MobileCreateNote() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bases = useKnowledgeBasesQuery();
  const create = useCreateNoteMutation();

  const presetBaseId = Number(searchParams.get("baseId"));
  const [selectedBaseId, setSelectedBaseId] = useState<number | null>(
    Number.isSafeInteger(presetBaseId) && presetBaseId > 0 ? presetBaseId : null,
  );

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
      router.push(`/m/notes/${effectiveBaseId}/${noteId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败，请稍后重试");
    }
  }

  return (
    <MobileScreen title="新建笔记" back="/m/notes">
      <div className="space-y-6 p-4" data-testid="mobile-create-note">
        {bases.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        ) : bases.isError ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            知识库加载失败：{bases.error.message}
          </p>
        ) : baseList.length === 0 ? (
          <div className="space-y-3 rounded-xl border border-dashed p-6 text-center">
            <Library className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">还没有知识库</p>
            <p className="text-sm text-muted-foreground">笔记必须归属一个知识库，先创建一个。</p>
            <CreateBaseDialog onCreated={(baseId) => setSelectedBaseId(baseId)} />
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">归属知识库</legend>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {baseList.map((base) => (
                  <li key={base.id}>
                    <button
                      type="button"
                      aria-pressed={base.id === effectiveBaseId}
                      onClick={() => setSelectedBaseId(base.id)}
                      className={cn(
                        "flex min-h-14 w-full items-center gap-3 px-4 text-left text-sm outline-none transition-colors",
                        base.id === effectiveBaseId ? "bg-primary/5 text-primary" : "",
                      )}
                    >
                      <Library className="size-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">
                        {base.knowledgeBaseName ?? "未命名知识库"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="note-title">标题</Label>
              <Input
                id="note-title"
                autoComplete="off"
                placeholder="3-15 个字符"
                className="min-h-11"
                {...form.register("title")}
              />
              {form.formState.errors.title ? (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              ) : null}
            </div>

            <Button
              type="submit"
              className="min-h-11 w-full"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "创建中…" : "创建笔记"}
            </Button>
          </form>
        )}
      </div>
    </MobileScreen>
  );
}
