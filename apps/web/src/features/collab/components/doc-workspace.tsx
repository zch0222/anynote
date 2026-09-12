"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import type { CollaborationBinding } from "@/components/editor/presets/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CollabPresence, CollabStatusBadge } from "@/features/collab/components/collab-status";
import { useCollabIndex } from "@/features/collab/use-collab-index";
import { useCollabRoom } from "@/features/collab/use-collab-room";
import { collabDocRoom } from "@/lib/collab/rooms";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** 正文停止变动多久后才把 updatedAt 写回索引，避免每次击键都广播一次索引更新。 */
const TOUCH_DEBOUNCE_MS = 2_000;

/**
 * `/docs/[id]`：协同文档编辑页。
 *
 * 同时连两个房间——`doc:<id>` 装正文，`index` 装标题与更新时间。
 * 正文不经过任何后端接口：它的唯一真相是协同服务里的 Y.Doc。
 */
export function CollabDocWorkspace({ docId }: { docId: string }) {
  const room = useMemo(() => collabDocRoom(docId), [docId]);
  const content = useCollabRoom(room);
  const index = useCollabIndex();

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
            className="h-9 max-w-md border-transparent bg-transparent text-lg font-semibold shadow-none focus-visible:border-input"
          />
        </div>
        <div className="flex items-center gap-3">
          <CollabPresence peers={content.peers} />
          <CollabStatusBadge status={content.status} />
        </div>
      </header>

      {content.status === "error" ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          协同服务连接失败：{content.error?.message ?? "未知错误"}。请确认 collab 服务已启动。
        </p>
      ) : collaboration ? (
        <TiptapEditor
          preset="collaborative"
          value=""
          collaboration={collaboration}
          onChange={handleChange}
          fill
          className="min-h-0 flex-1"
        />
      ) : (
        <div className="space-y-3 rounded-xl border bg-card p-4" aria-busy="true">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      )}
    </section>
  );
}
