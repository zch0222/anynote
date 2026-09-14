"use client";

import { CardGridSkeleton } from "@/components/loading/skeletons";
import { KnowledgeBaseSelect } from "@/components/shared/knowledge-base-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { coverClassName } from "@/features/notes/lib/cover-gradient";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { Library, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCreateMoocMutation, useMoocsQuery } from "../use-moocs";

/**
 * 课程列表。
 *
 * 两种用法：
 * - 知识库内（`/notes/:id/mooc`）：`baseId` 由路由给定，不显示选择器——
 *   用户已经在某个库里了，再让他选一次是多余的。
 * - 跨库（`/mooc`）：不传 `baseId`，退回知识库选择器，默认第一个库。
 */
export function MoocPage({ baseId: fixedBaseId }: { baseId?: number | undefined } = {}) {
  const router = useRouter();
  const bases = useKnowledgeBasesQuery();
  const [pickedBaseId, setPickedBaseId] = useState<number | null>(null);
  const baseId = fixedBaseId ?? pickedBaseId;
  const moocs = useMoocsQuery(baseId ?? 0);
  const [creating, setCreating] = useState(false);

  const firstBase = bases.data?.[0];
  useEffect(() => {
    if (fixedBaseId === undefined && pickedBaseId === null && firstBase) {
      setPickedBaseId(firstBase.id);
    }
  }, [fixedBaseId, firstBase, pickedBaseId]);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-title text-label">慕课</h1>
          <p className="text-footnote text-label-secondary">整理课程与学习资料，持续积累。</p>
        </div>
        <div className="flex items-center gap-2">
          {fixedBaseId === undefined ? (
            <KnowledgeBaseSelect
              bases={bases.data ?? []}
              value={baseId}
              onChange={setPickedBaseId}
            />
          ) : null}
          <Button
            variant="outline"
            disabled={!baseId}
            onClick={() => {
              setCreating(true);
            }}
            data-testid="mooc-create"
          >
            <Plus className="size-4" aria-hidden="true" />
            新建课程
          </Button>
        </div>
      </div>

      {bases.isPending ? null : !baseId ? (
        <EmptyState title="还没有可用的知识库" hint="课程挂在知识库下，先创建一个知识库。" />
      ) : moocs.isPending ? (
        <CardGridSkeleton count={3} cardClassName="h-40" />
      ) : moocs.isError ? (
        <p role="alert" className="rounded-lg bg-danger/5 p-6 text-footnote text-danger">
          课程加载失败：{moocs.error.message}
        </p>
      ) : moocs.data.rows.length === 0 ? (
        <EmptyState title="这个知识库下还没有课程" hint="新建一门课，把视频和资料整理进来。" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="mooc-grid">
          {moocs.data.rows.map((mooc) => (
            <li key={mooc.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full cursor-pointer flex-col overflow-hidden rounded-lg bg-surface text-left shadow-card outline-none",
                  "transition-shadow hover:shadow-popover focus-visible:ring-2 focus-visible:ring-ring",
                )}
                onClick={() => {
                  router.push(`/mooc/${mooc.id}`);
                }}
                data-testid={`mooc-card-${mooc.id}`}
              >
                <span aria-hidden="true" className={cn(coverClassName(mooc.id), "h-20 w-full")} />
                <span className="space-y-1.5 p-4">
                  <span className="flex items-center gap-2 text-headline font-semibold text-label">
                    <Library className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
                    <span className="truncate">{mooc.title ?? "未命名课程"}</span>
                  </span>
                  <span className="line-clamp-2 block text-footnote text-label-secondary">
                    {mooc.moocDescription?.trim() || "还没有填写简介"}
                  </span>
                  <span className="block pt-1 text-xs text-label-tertiary">
                    {mooc.updateTime
                      ? `更新于 ${formatRelativeTime(mooc.updateTime)}`
                      : "暂无更新记录"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {baseId ? (
        <CreateMoocDialog
          knowledgeBaseId={baseId}
          open={creating}
          onOpenChange={setCreating}
          onCreated={(id) => {
            router.push(`/mooc/${id}`);
          }}
        />
      ) : null}
    </section>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dashed border-separator p-10 text-center">
      <Library className="mx-auto size-8 text-label-tertiary" aria-hidden="true" />
      <p className="mt-3 text-headline text-label">{title}</p>
      <p className="mt-1 text-footnote text-label-secondary">{hint}</p>
    </div>
  );
}

function CreateMoocDialog({
  knowledgeBaseId,
  open,
  onOpenChange,
  onCreated,
}: {
  knowledgeBaseId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (moocId: number) => void;
}) {
  const create = useCreateMoocMutation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const submit = async () => {
    const trimmed = title.trim();
    if (trimmed.length < 2) {
      toast.error("课程名称至少 2 个字符");
      return;
    }
    try {
      const id = await create.mutateAsync({
        title: trimmed,
        moocDescription: description.trim() || undefined,
        knowledgeBaseId,
      });
      toast.success("课程已创建");
      onOpenChange(false);
      setTitle("");
      setDescription("");
      onCreated(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败，请稍后重试");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建课程</DialogTitle>
          <DialogDescription>课程会挂在当前选中的知识库下。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mooc-title">课程名称</Label>
            <Input
              id="mooc-title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
              maxLength={50}
              placeholder="例如：高等数学（上）"
              data-testid="mooc-title-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mooc-description">课程简介</Label>
            <Textarea
              id="mooc-description"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
              maxLength={200}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={create.isPending}
            data-testid="mooc-submit"
          >
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
