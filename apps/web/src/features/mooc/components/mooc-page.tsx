"use client";

import { KnowledgeBaseSelect } from "@/components/shared/knowledge-base-select";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { Library, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCreateMoocMutation, useMoocsQuery } from "../use-moocs";

/** `/mooc`：知识库选择 + 课程卡片网格 + 新建课程。 */
export function MoocPage() {
  const router = useRouter();
  const bases = useKnowledgeBasesQuery();
  const [baseId, setBaseId] = useState<number | null>(null);
  const moocs = useMoocsQuery(baseId ?? 0);
  const [creating, setCreating] = useState(false);

  const firstBase = bases.data?.[0];
  useEffect(() => {
    if (baseId === null && firstBase) {
      setBaseId(firstBase.id);
    }
  }, [firstBase, baseId]);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">课程</h1>
          <p className="text-sm text-muted-foreground">整理课程与学习资料，持续积累。</p>
        </div>
        <div className="flex items-center gap-2">
          <KnowledgeBaseSelect bases={bases.data ?? []} value={baseId} onChange={setBaseId} />
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
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Library className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">还没有可用的知识库</p>
          <p className="mt-1 text-sm text-muted-foreground">
            课程挂在知识库下，先到笔记页创建一个。
          </p>
        </div>
      ) : moocs.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : moocs.isError ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          课程加载失败：{moocs.error.message}
        </p>
      ) : moocs.data.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Library className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">这个知识库下还没有课程</p>
          <p className="mt-1 text-sm text-muted-foreground">新建一门课，把视频和资料整理进来。</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {moocs.data.rows.map((mooc) => (
            <li key={mooc.id}>
              <button
                type="button"
                className="w-full cursor-pointer rounded-xl border bg-card text-left shadow-sm transition-colors hover:border-primary/40"
                onClick={() => {
                  router.push(`/mooc/${mooc.id}`);
                }}
                data-testid={`mooc-card-${mooc.id}`}
              >
                <div className="space-y-1.5 p-5">
                  <p className="flex items-center gap-2 font-medium">
                    <Library className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{mooc.title ?? "未命名课程"}</span>
                  </p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {mooc.moocDescription?.trim() || "还没有填写简介"}
                  </p>
                  <p className="pt-1 text-xs text-muted-foreground">
                    {mooc.updateTime ? `更新于 ${mooc.updateTime.slice(0, 10)}` : "暂无更新记录"}
                  </p>
                </div>
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
