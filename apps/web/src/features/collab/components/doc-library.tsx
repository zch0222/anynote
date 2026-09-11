"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { CollabPresence, CollabStatusBadge } from "@/features/collab/components/collab-status";
import { type CollabDocTitleInput, collabDocTitleSchema } from "@/features/collab/schemas";
import { useCollabIndex } from "@/features/collab/use-collab-index";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

function formatTime(value: number) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

/**
 * `/docs`：协同文档库。
 *
 * 列表本身就存在协同索引房间里，所以「有哪些文档」也是实时同步的——
 * 这里没有任何后端接口调用，新建 / 改名 / 删除都是对 Y.Doc 的本地写入。
 */
export function CollabDocLibrary() {
  const router = useRouter();
  const { docs, status, error, peers, createDoc, removeDoc } = useCollabIndex();
  const [open, setOpen] = useState(false);

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
    setOpen(false);
    form.reset();
    router.push(`/docs/${created.id}`);
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">文档</h1>
          <p className="text-sm text-muted-foreground">
            多人实时协同编辑，改动即时同步给所有在线成员。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CollabPresence peers={peers} />
          <CollabStatusBadge status={status} />
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) form.reset();
            }}
          >
            <DialogTrigger render={<Button disabled={status !== "connected"} />}>
              <Plus className="size-4" aria-hidden="true" />
              新建文档
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <DialogHeader>
                  <DialogTitle>新建协同文档</DialogTitle>
                  <DialogDescription>
                    创建后把链接发给同伴，你们就能同时编辑同一篇文档。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="collab-doc-title">标题</Label>
                  <Input id="collab-doc-title" autoComplete="off" {...form.register("title")} />
                  {form.formState.errors.title ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.title.message}
                    </p>
                  ) : null}
                </div>
                <DialogFooter>
                  <Button type="submit">创建</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {status === "error" ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          协同服务连接失败：{error?.message ?? "未知错误"}。请确认 collab 服务已启动。
        </p>
      ) : status !== "connected" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <FileText className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">还没有协同文档</p>
          <p className="mt-1 text-sm text-muted-foreground">新建一篇，把链接发给同伴就能一起写。</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((item) => (
            <li key={item.id}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Link href={`/docs/${item.id}`} className="truncate hover:underline">
                      {item.title}
                    </Link>
                  </CardTitle>
                  <CardDescription>由 {item.createdBy} 创建</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>更新于 {formatTime(item.updatedAt)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`删除 ${item.title}`}
                    onClick={() => {
                      if (removeDoc(item.id)) toast.success("已从文档库移除");
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
