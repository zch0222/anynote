"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import type { CollaborationBinding } from "@/components/editor/presets/types";
import { PanelSkeleton } from "@/components/loading/skeletons";
import { ConnectionBanner, EmptyState } from "@/components/shared/states";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollabPresence, CollabStatusBadge } from "@/features/collab/components/collab-status";
import { useCollabIndex } from "@/features/collab/use-collab-index";
import { useCollabRoom } from "@/features/collab/use-collab-room";
import { collabDocRoom } from "@/lib/collab/rooms";
import { ArrowLeft, FileText, Link2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/** 正文停止变动多久后才把 updatedAt 写回索引，避免每次击键都广播一次索引更新。 */
const TOUCH_DEBOUNCE_MS = 2_000;

/**
 * 索引已同步、但里面没有这个 id。
 *
 * 三种输入要分开看待，否则会把「还没读到」误判成「已被移除」：
 * - `"unknown"`：索引**还没完成同步**。不做判断——刚进页面时 `docs` 天然是空的，
 *   这时弹「已移除」会把正常的文档挡在门外。
 * - `"removed"`：索引已同步且明确读了条目，就是没有它。这才是一次真实的移除。
 * - `"present"`：正常文档。
 */
export type DocPresence = "unknown" | "removed" | "present";

/**
 * 判断当前文档在索引里的存在状态。
 *
 * 纯函数，单独导出是为了能被用例直接钉住三个分支——
 * 这个判定的代价很高（判错就打开一个空房间，或把正常文档挡掉），
 * 埋在组件里只能通过渲染间接测到。
 *
 * 判据是 `synced` 而**不是** `status === "connected"`：后者只说明 WebSocket
 * 握手成功，此刻本地 Y.Doc 还是空的。用 `connected` 会让每一篇正常文档
 * 在打开的头几十毫秒里闪一下「已从文档库移除」。
 */
export function readDocPresence(
  indexSynced: boolean,
  docs: readonly { id: string }[],
  docId: string,
): DocPresence {
  // 索引尚未同步时不做任何判断：此时「找不到」多半只是数据还没到
  if (!indexSynced) return "unknown";
  return docs.some((item) => item.id === docId) ? "present" : "removed";
}

/**
 * `/docs/[id]`：协同文档编辑页。
 *
 * 同时连两个房间——`doc:<id>` 装正文，`index` 装标题与更新时间。
 * 正文不经过任何后端接口：它的唯一真相是协同服务里的 Y.Doc。
 */
export function CollabDocWorkspace({ docId }: { docId: string }) {
  const index = useCollabIndex();
  const presence = readDocPresence(index.synced, index.docs, docId);

  /*
   * 索引排在正文之前：必须先知道这篇文档还在不在，才能决定要不要连它的房间。
   * 判为已移除时传 `null`（`useCollabRoom` 的"暂不连接"），**真的不开这条连接**——
   * 否则每有一个过期的书签被打开，协同服务上就多一个没人读的空房间，
   * 而它的正文还会被重新拉回本地。
   */
  const room = useMemo(() => collabDocRoom(docId), [docId]);
  const content = useCollabRoom(presence === "removed" ? null : room);

  const meta = index.docs.find((item) => item.id === docId);
  const [title, setTitle] = useState("");
  const loadedTitle = useRef<string | null>(null);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 只在首次读到索引条目时灌一次标题，之后以本地输入为准，
  // 否则远端 updatedAt 变化会把正在输入的标题顶回去。
  useEffect(() => {
    if (!meta || loadedTitle.current === docId) return;
    loadedTitle.current = docId;
    setTitle(meta.title);
  }, [meta, docId]);

  useEffect(() => {
    return () => {
      if (touchTimer.current) clearTimeout(touchTimer.current);
    };
  }, []);

  const collaboration: CollaborationBinding | undefined = useMemo(() => {
    if (!content.doc || !content.provider || !content.user) return undefined;
    return {
      doc: content.doc,
      provider: content.provider,
      user: { name: content.user.name, color: content.user.color },
    };
  }, [content.doc, content.provider, content.user]);

  const { touchDoc, renameDoc } = index;

  const handleChange = useCallback(() => {
    if (touchTimer.current) clearTimeout(touchTimer.current);
    touchTimer.current = setTimeout(() => touchDoc(docId), TOUCH_DEBOUNCE_MS);
  }, [docId, touchDoc]);

  const commitTitle = useCallback(() => {
    const next = title.trim();
    if (!next || next === meta?.title) return;
    renameDoc(docId, next.slice(0, 60));
  }, [docId, renameDoc, meta?.title, title]);

  /**
   * D-11 图例 5：把地址复制给同伴是协作的第一步。
   *
   * 用 `location.href` 而不是自己拼 `env.NEXT_PUBLIC_*`：用户可能正通过
   * 内网地址或预览域访问，拼出来的链接对他自己不一定打得开。
   */
  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("链接已复制，发给同伴即可一起编辑");
    } catch {
      // 非安全上下文（http 的局域网地址）下 clipboard 不可用，如实说明而不是静默失败
      toast.error("当前环境不允许自动复制，请手动复制地址栏链接");
    }
  }, []);

  // 文档已被其他成员移除：不再打开一个空房间冒充它
  if (presence === "removed") {
    return (
      <section className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center gap-4">
        {/* D-11 图例 13 + Q-02「不存在」口径：标题、说明、动作逐字照抄文案表 */}
        <EmptyState
          icon={FileText}
          title="这篇文档已从文档库移除"
          hint="可能被其他成员移除了。"
          action={
            // 纯导航动作，直接渲染成 `<a>`：`Button` 的 `render` 换成链接会被 Base UI
            // 按原生按钮处理，把"这是一条导航"的语义与右键复制地址一起丢掉
            <Link href="/docs" className={buttonVariants({ variant: "outline", size: "sm" })}>
              回到文档库
            </Link>
          }
        />
      </section>
    );
  }

  return (
    <section className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="返回文档库"
            render={<Link href="/docs" />}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Button>
          <Input
            aria-label="文档标题"
            value={title}
            placeholder="未命名文档"
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitTitle}
            className="h-9 max-w-md border-transparent bg-transparent text-lg font-semibold shadow-none focus-visible:border-separator"
          />
        </div>
        <div className="flex items-center gap-3">
          <CollabPresence peers={content.peers} />
          <CollabStatusBadge status={content.status} />
          {/* D-11 图例 5：outline 次按钮，与状态徽标同高 */}
          <Button variant="outline" size="sm" onClick={() => void copyLink()}>
            <Link2 className="size-4" aria-hidden="true" />
            复制链接
          </Button>
        </div>
      </header>

      {content.status === "error" ? (
        /* Q-02 给 D-11 的错误口径：一句用户语言 + 重试（图例 12） */
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/5 p-6"
        >
          <p className="min-w-0 flex-1 text-footnote text-danger">协同服务暂时连不上，稍后重试。</p>
          <Button variant="outline" size="sm" onClick={content.reconnect}>
            重新连接
          </Button>
        </div>
      ) : (
        <>
          {/*
            D-11 图例 10：**断线不挡正文**。Y.Doc 在本地保留改动，恢复连接后自动同步，
            所以这里是提示条而不是错误块——换成错误块就等于把用户锁在只读状态，
            而他的输入其实一点都不会丢。
          */}
          {content.status !== "connected" && collaboration ? (
            <ConnectionBanner onReconnect={content.reconnect} />
          ) : null}
          {collaboration ? (
            <TiptapEditor
              preset="collaborative"
              value=""
              collaboration={collaboration}
              onChange={handleChange}
              // 与笔记编辑器一致：桌面版没有常驻工具条（设计稿的形态）
              toolbar="none"
              fill
              className="min-h-0 flex-1"
            />
          ) : (
            <PanelSkeleton />
          )}
        </>
      )}
    </section>
  );
}
