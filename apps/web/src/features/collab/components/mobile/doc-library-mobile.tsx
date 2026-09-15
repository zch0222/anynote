"use client";

import { MobileActionSheet } from "@/components/layout/mobile/mobile-action-sheet";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CollabStatusBadge } from "@/features/collab/components/collab-status";
import { type CollabDocTitleInput, collabDocTitleSchema } from "@/features/collab/schemas";
import { useCollabIndex } from "@/features/collab/use-collab-index";
import { formatRelativeTime } from "@/lib/format-time";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

/**
 * 索引里的 `updatedAt` 是毫秒时间戳，`formatRelativeTime` 吃字符串，
 * 这里转一次 ISO——不引 dayjs（移动端 250KB 预算里没有它的位置）。
 */
function relativeTime(value: number) {
  return formatRelativeTime(new Date(value).toISOString());
}

/**
 * `/m/docs`：协同文档库的移动端版本。
 *
 * 列表本身就是协同数据（索引房间里的 Y.Array），所以这里同样没有任何后端接口调用。
 * 与桌面的差别只有三处：单列列表、删除走底部动作表（触摸端没有 hover）、
 * 详情跳 `/m/docs/...`。在线人数不进顶栏——手机上位置金贵，交给详情页显示。
 */
export function MobileDocLibrary() {
  const router = useRouter();
  const { docs, status, error, createDoc, removeDoc } = useCollabIndex();
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState<{ id: string; title: string } | null>(null);

  const form = useForm<CollabDocTitleInput>({
    resolver: zodResolver(collabDocTitleSchema),
    defaultValues: { title: "" },
  });

  function onSubmit(values: CollabDocTitleInput) {
    const created = createDoc(values.title);
    if (!created) {
      toast.error("协同服务尚未连接，稍后再试");
      return;
    }
    setCreating(false);
    form.reset();
    router.push(`/m/docs/${created.id}`);
  }

  return (
    // M-08 图例 1：本页不是 tab 根页，必须有返回键；深链直开兜底回「我的」
    <MobileScreen title="协同文档" back="/m/me" actions={<CollabStatusBadge status={status} />}>
      <div className="space-y-4 p-4" data-testid="mobile-doc-library">
        {status === "error" ? (
          <p className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
            协同服务连接失败：{error?.message ?? "未知错误"}。请确认 collab 服务已启动。
          </p>
        ) : status !== "connected" ? (
          <ListRowsSkeleton count={2} />
        ) : docs.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <FileText className="mx-auto size-8 text-label-secondary" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">还没有协同文档</p>
            <p className="mt-1 text-sm text-label-secondary">
              新建一篇，把链接发给同伴就能一起写。
            </p>
          </div>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-surface">
            {docs.map((item) => (
              <li key={item.id} className="flex items-center">
                <Link
                  href={`/m/docs/${item.id}`}
                  className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-sm outline-none focus-visible:bg-fill-hover"
                >
                  <FileText className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.title}</span>
                    {/* M-08 图例 6：「陈可 · 2 小时前更新」，不铺全量时间戳 */}
                    <span className="block truncate text-xs text-label-tertiary">
                      {item.createdBy} · {relativeTime(item.updatedAt)}更新
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  aria-label={`${item.title} 的操作`}
                  onClick={() => setActing({ id: item.id, title: item.title })}
                  className="flex size-11 shrink-0 items-center justify-center text-label-secondary outline-none focus-visible:bg-fill-hover"
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <Button
          className="min-h-11 w-full"
          disabled={status !== "connected"}
          onClick={() => setCreating(true)}
          data-testid="mobile-doc-create"
        >
          <Plus className="size-4" aria-hidden="true" />
          新建文档
        </Button>
      </div>

      {/* 新建表单走底部弹层而不是居中对话框：手机上对话框会被软键盘顶掉一半 */}
      <Sheet
        open={creating}
        onOpenChange={(next) => {
          setCreating(next);
          if (!next) form.reset();
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]"
          data-testid="mobile-doc-create-form"
        >
          <SheetHeader>
            <SheetTitle>新建协同文档</SheetTitle>
            <SheetDescription>创建后把链接发给同伴，你们就能同时编辑同一篇文档。</SheetDescription>
          </SheetHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 px-4 pb-4">
            <Label htmlFor="collab-doc-title">标题</Label>
            <Input
              id="collab-doc-title"
              autoComplete="off"
              className="min-h-11"
              {...form.register("title")}
            />
            {form.formState.errors.title ? (
              <p className="text-xs text-danger">{form.formState.errors.title.message}</p>
            ) : null}
            <Button type="submit" className="min-h-11 w-full">
              创建
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {acting ? (
        <MobileActionSheet
          open
          onOpenChange={(next) => {
            if (!next) setActing(null);
          }}
          title={acting.title}
          description="移除后所有成员的文档库里都看不到它。"
          actions={[
            {
              label: "从文档库移除",
              destructive: true,
              // 动作表自带二次确认：第一次点只把标签换成这句，第二次才真的移除
              confirm: "再点一次确认移除",
              onSelect: () => {
                if (removeDoc(acting.id)) toast.success("已从文档库移除");
                setActing(null);
              },
            },
          ]}
        />
      ) : null}
    </MobileScreen>
  );
}
