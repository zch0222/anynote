"use client";

import { MobileActionSheet } from "@/components/layout/mobile/mobile-action-sheet";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
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
import { Skeleton } from "@/components/ui/skeleton";
import { CollabStatusBadge } from "@/features/collab/components/collab-status";
import { type CollabDocTitleInput, collabDocTitleSchema } from "@/features/collab/schemas";
import { useCollabIndex } from "@/features/collab/use-collab-index";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

function formatTime(value: number) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
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
    <MobileScreen title="文档" actions={<CollabStatusBadge status={status} />}>
      <div className="space-y-4 p-4" data-testid="mobile-doc-library">
        {status === "error" ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            协同服务连接失败：{error?.message ?? "未知错误"}。请确认 collab 服务已启动。
          </p>
        ) : status !== "connected" ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <FileText className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">还没有协同文档</p>
            <p className="mt-1 text-sm text-muted-foreground">
              新建一篇，把链接发给同伴就能一起写。
            </p>
          </div>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {docs.map((item) => (
              <li key={item.id} className="flex items-center">
                <Link
                  href={`/m/docs/${item.id}`}
                  className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-sm outline-none focus-visible:bg-accent"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.createdBy} · 更新于 {formatTime(item.updatedAt)}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  aria-label={`${item.title} 的操作`}
                  onClick={() => setActing({ id: item.id, title: item.title })}
                  className="flex size-11 shrink-0 items-center justify-center text-muted-foreground outline-none focus-visible:bg-accent"
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
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
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
          actions={[
            {
              label: "从文档库移除",
              destructive: true,
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
