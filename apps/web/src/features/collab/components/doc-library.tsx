"use client";

import { CardGridSkeleton } from "@/components/loading/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/states";
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
import { CollabPresence, CollabStatusBadge } from "@/features/collab/components/collab-status";
import { type CollabDocTitleInput, collabDocTitleSchema } from "@/features/collab/schemas";
import { useCollabIndex } from "@/features/collab/use-collab-index";
import { KB_CONTENT_COLUMN } from "@/features/notes/components/knowledge-base-page-header";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Info, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

/**
 * 索引里的 `updatedAt` 是毫秒时间戳，而 `formatRelativeTime` 吃的是时间字符串。
 * 转换放在这里而不是改那个工具函数：它同时服务于后端返回的 ISO 串（笔记列表），
 * 为一个调用点放宽入参类型会让"传错格式"在别处悄悄变成 Invalid Date。
 */
export function formatDocTime(value: number): string {
  return formatRelativeTime(new Date(value).toISOString());
}

/**
 * `/docs`：协同文档库。
 *
 * 列表本身就存在协同索引房间里，所以「有哪些文档」也是实时同步的——
 * 这里没有任何后端接口调用，新建 / 改名 / 删除都是对 Y.Doc 的本地写入。
 */
export function CollabDocLibrary() {
  const router = useRouter();
  const { docs, status, synced, error, peers, createDoc, removeDoc, reconnect } = useCollabIndex();
  const [open, setOpen] = useState(false);
  // 待确认删除的文档；非 null 时确认框打开。整条记录而不是只留 id：
  // 确认框标题里要点出文档名，而文档可能在确认期间被同伴删掉。
  const [pendingRemoval, setPendingRemoval] = useState<{ id: string; title: string } | null>(null);

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

  function confirmRemoval() {
    if (pendingRemoval && removeDoc(pendingRemoval.id)) {
      toast.success("已从文档库移除");
    }
    setPendingRemoval(null);
  }

  return (
    /*
     * D-10：内容列 1000px（画板卡片 320 宽、三列）。原来用 `max-w-6xl`（1152），
     * 实测内容列 1104px、卡片 357 宽——比画板宽了一档，三列排下来整块偏右。
     * 与知识库内各 Tab 用同一个列宽（`KB_CONTENT_COLUMN`），全站文档流页面统一。
     */
    <section className={cn(KB_CONTENT_COLUMN, "space-y-8")}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          {/* D-10 图例 2：Display 34/41，与侧栏「协同文档」入口同名 */}
          <h1 className="text-display text-label">协同文档</h1>
          <p className="text-body text-label-secondary">
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
                    <p className="text-xs text-danger">{form.formState.errors.title.message}</p>
                  ) : null}
                </div>
                <DialogFooter>
                  {/* D-10 图例 24：此前页脚只有「创建」，误开对话框后只能按 Esc 或点遮罩 */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      form.reset();
                    }}
                  >
                    取消
                  </Button>
                  <Button type="submit">创建</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {status === "error" ? (
        /*
         * D-10 图例 15 / 16：文案改成用户语言（旧文案「请确认 collab 服务已启动」
         * 是写给开发者的），并给一个「重新连接」——y-websocket 自己也会退避重连，
         * 但用户看不到那个过程，只能靠刷新整页，而刷新会把还没同步的正文副本丢掉。
         */
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/5 p-6"
        >
          <p className="min-w-0 flex-1 text-footnote text-danger">
            协同服务暂时连不上，已写下的内容不会丢失。
          </p>
          <Button variant="outline" size="sm" onClick={reconnect}>
            重新连接
          </Button>
        </div>
      ) : status !== "connected" || !synced ? (
        /*
         * 用 `synced` 而不是只看 `status`：WebSocket 握手成功时本地 Y.Doc 还是空的，
         * 此刻 `docs` 必然是 `[]`，直接往下走会在每一篇文档都还在的情况下先闪一下
         * 「还没有协同文档」。等真正收到索引快照再决定空不空。
         */
        <CardGridSkeleton count={4} cardClassName="h-36" />
      ) : docs.length === 0 ? (
        // D-10 图例 18：空态也要能直接新建，不能只指回页头
        <EmptyState
          icon={FileText}
          title="还没有协同文档"
          hint="新建一篇，把链接发给同伴就能一起写。"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              新建文档
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((item) => (
            <li key={item.id}>
              {/*
                D-10 图例 7：**整张卡片可点**，不是只有标题文字。
                卡片本身不能是 `<a>`——里面还有删除按钮，链接套按钮在
                键盘与读屏下都是不合法的嵌套。这里用「绝对定位的覆盖层链接 +
                按钮 z-10 抬起」的经典做法：点击面覆盖整卡，而删除仍可独立聚焦。
              */}
              <Card className="relative h-full transition-shadow has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring hover:shadow-popover">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
                    <Link
                      href={`/docs/${item.id}`}
                      className="truncate outline-none after:absolute after:inset-0 after:content-['']"
                    >
                      {item.title}
                    </Link>
                  </CardTitle>
                  <CardDescription>由 {item.createdBy} 创建</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-xs text-label-tertiary">
                  {/* D-10 图例 10：相对时间，不再铺 toLocaleString 全量时间戳 */}
                  <span>{formatDocTime(item.updatedAt)}更新</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    // z-10 把按钮抬到整卡点击层之上，否则点删除会跳进文档
                    className="relative z-10"
                    aria-label={`删除 ${item.title}`}
                    onClick={() => setPendingRemoval({ id: item.id, title: item.title })}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/*
        D-10 图例 13：网格下方的范围说明。
        侧栏把「协同文档」画在知识库分组**之外**，但从知识库进来的人容易以为
        它属于当前库；不写清"全站共享"就会有人问"我建的文档同事怎么看不到"。
      */}
      <p className="flex items-start gap-1.5 text-footnote text-label-tertiary">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        文档库是全站共享的：所有登录成员看到的是同一份列表，不按知识库划分。
      </p>

      {/* D-10 图例 12 + ②：删除必须先确认——索引是共享状态，误删会让所有人看不到 */}
      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(next) => {
          if (!next) setPendingRemoval(null);
        }}
        title="从文档库移除？"
        description={
          pendingRemoval
            ? `「${pendingRemoval.title}」会从所有人的文档库里消失，正文仍保留在协同服务上。`
            : ""
        }
        confirmLabel="移除"
        tone="danger"
        onConfirm={confirmRemoval}
      />
    </section>
  );
}
