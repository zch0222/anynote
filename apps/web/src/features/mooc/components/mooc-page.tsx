"use client";

import { moocDetailHref } from "@/components/layout/navigation";
import { CardGridSkeleton } from "@/components/loading/skeletons";
import { EmptyState, QueryError } from "@/components/shared/states";
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
import {
  KB_CONTENT_COLUMN,
  KnowledgeBasePageHeader,
} from "@/features/notes/components/knowledge-base-page-header";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { toUserMessage } from "@/lib/api/errors";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { Library, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useCreateMoocMutation, useMoocsQuery } from "../use-moocs";

/** 课程名称上限，与输入框的计数器、后端 `@Size(max = 50)` 三处一致。 */
const TITLE_MAX_LENGTH = 50;

/**
 * 知识库「慕课」Tab（`/notes/[baseId]/mooc`，D-05）。
 *
 * 课程只属于知识库：`baseId` 必填，跨库的 `/mooc` 已改为重定向到 `/notes`。
 * 早先那套"跨库列表 + 知识库选择器 + 默认选第一个库"的分支已删除——
 * 从知识库进来的人已经在库里了，再让他选一次只是把归属关系重新问一遍。
 */
export function MoocPage({ baseId }: { baseId: number }) {
  const base = useKnowledgeBaseQuery(baseId);
  const moocs = useMoocsQuery(baseId);
  const [creating, setCreating] = useState(false);

  // 可阅读（3）与无权限（4）不出现新建入口：避免点了才被后端拒绝
  const canCreate = typeof base.data?.permissions === "number" && base.data.permissions <= 2;

  /*
   * 副标题走画板口径（D-05 实测：`6 门课程 · 最近更新于 2 小时前`）：报真实统计，
   * 而不是「整理课程与学习资料，持续积累。」这类固定文案——固定文案在零课程与
   * 多课程时读起来一模一样，页头就不再提供任何信息。
   */
  const moocTotal = moocs.data?.total ?? 0;
  const latestMooc = moocs.data?.rows[0];
  const moocSubtitle = moocTotal
    ? `${moocTotal} 门课程${latestMooc?.updateTime ? ` · 最近更新于 ${formatRelativeTime(latestMooc.updateTime)}` : ""}`
    : "整理课程与学习资料，持续积累。";

  return (
    <section className={cn(KB_CONTENT_COLUMN, "space-y-5")}>
      {/* D-05 页头：H1 Display + 真实统计副标题 + 搜索/主题/新建课程动作行 */}
      <KnowledgeBasePageHeader
        title="慕课"
        subtitle={moocSubtitle}
        actions={
          canCreate ? (
            <Button onClick={() => setCreating(true)} data-testid="mooc-create">
              <Plus className="size-4" aria-hidden="true" />
              新建课程
            </Button>
          ) : null
        }
      />

      {moocs.isPending ? (
        <CardGridSkeleton count={3} cardClassName="h-40" />
      ) : moocs.isError ? (
        <QueryError
          object="课程"
          message={toUserMessage(moocs.error)}
          onRetry={() => void moocs.refetch()}
          retrying={moocs.isFetching}
        />
      ) : moocs.data.rows.length === 0 ? (
        <EmptyState
          icon={Library}
          title="这个知识库下还没有课程"
          hint="新建一门课，把视频和资料整理进来。"
          action={
            canCreate ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreating(true)}
                data-testid="mooc-create-empty"
              >
                <Plus className="size-4" aria-hidden="true" />
                新建课程
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="mooc-grid">
          {moocs.data.rows.map((mooc) => (
            // 整卡是 `Link` 而不是带 onClick 的 button（D-05 图例 7）：
            // 链接能被新标签页打开、能被读屏报成"链接"、右键也有真实地址，
            // 这些能力在 `router.push` 上一个都拿不到。
            <li key={mooc.id}>
              <Link
                href={moocDetailHref(baseId, mooc.id)}
                className={cn(
                  "flex w-full flex-col overflow-hidden rounded-lg bg-surface text-left shadow-card outline-none",
                  "transition-shadow hover:shadow-popover focus-visible:ring-2 focus-visible:ring-ring",
                )}
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
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateMoocDialog
        knowledgeBaseId={baseId}
        baseName={base.data?.knowledgeBaseName?.trim() || "当前知识库"}
        open={creating}
        onOpenChange={setCreating}
      />
    </section>
  );
}

/**
 * 新建课程对话框（D-05 图例 21 / 23 / 29）。
 *
 * 校验走**内联**而不是 toast：toast 三秒后消失，用户在表单里已经找不到是哪一项
 * 出的问题；内联错误贴在输入框下方，改到合规为止都在。
 */
function CreateMoocDialog({
  knowledgeBaseId,
  baseName,
  open,
  onOpenChange,
}: {
  knowledgeBaseId: number;
  baseName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateMoocMutation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setDescription("");
    setError(null);
  };

  const submit = async () => {
    const trimmed = title.trim();
    if (trimmed.length < 2) {
      setError("课程名称至少 2 个字符");
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({
        title: trimmed,
        moocDescription: description.trim() || undefined,
        knowledgeBaseId,
      });
      toast.success("课程已创建");
      onOpenChange(false);
      reset();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "创建失败，请稍后重试");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建课程</DialogTitle>
          <DialogDescription>课程会创建在「{baseName}」下。</DialogDescription>
        </DialogHeader>
        {/* 回车提交：表单默认行为，不需要给输入框挂 onKeyDown */}
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="mooc-title">课程名称</Label>
              <span
                className={cn("tabular text-xs", error ? "text-danger" : "text-label-tertiary")}
              >
                {title.length} / {TITLE_MAX_LENGTH}
              </span>
            </div>
            <Input
              id="mooc-title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                // 一旦开始改就把上一次的报错收掉，否则"已经合规了还红着"
                if (error) setError(null);
              }}
              // 打开即聚焦：对话框的唯一必填项，让用户直接开始打字
              autoFocus
              className="h-8 rounded-md"
              maxLength={TITLE_MAX_LENGTH}
              placeholder="例如：高等数学（上）"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "mooc-title-error" : undefined}
              autoComplete="off"
              data-testid="mooc-title-input"
            />
            {error ? (
              <p id="mooc-title-error" className="text-xs text-danger" role="alert">
                {error}
              </p>
            ) : null}
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={create.isPending} data-testid="mooc-submit">
              {create.isPending ? "创建中…" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
