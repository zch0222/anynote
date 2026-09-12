"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import type { CollaborationBinding } from "@/components/editor/presets/types";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CollabPresence, CollabStatusBadge } from "@/features/collab/components/collab-status";
import { useCollabIndex } from "@/features/collab/use-collab-index";
import { useCollabRoom } from "@/features/collab/use-collab-room";
import { collabDocRoom } from "@/lib/collab/rooms";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** 正文停止变动多久后才把 updatedAt 写回索引，避免每次击键都广播一次索引更新。 */
const TOUCH_DEBOUNCE_MS = 2_000;

/**
 * `/m/docs/[id]`：协同文档的移动端编辑页。
 *
 * 与桌面同样连两个房间（正文 + 索引），逻辑一行不改；差别是版式：
 * 标题进正文区顶部、在线状态与连接状态收进顶栏、编辑器用 `toolbar="mobile"`。
 */
export function MobileDocWorkspace({ docId }: { docId: string }) {
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
    <MobileScreen
      title={<CollabStatusBadge status={content.status} />}
      back="/m/docs"
      actions={<CollabPresence peers={content.peers} />}
      fill
      contentClassName="min-h-0"
    >
      {content.status === "error" ? (
        <p className="m-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          协同服务连接失败：{content.error?.message ?? "未知错误"}。请确认 collab 服务已启动。
        </p>
      ) : collaboration ? (
        <>
          <Input
            aria-label="文档标题"
            value={title}
            placeholder="未命名文档"
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitTitle}
            className="h-auto shrink-0 rounded-none border-0 border-b px-4 py-3 !text-xl font-semibold shadow-none focus-visible:ring-0"
          />
          <TiptapEditor
            preset="collaborative"
            toolbar="mobile"
            value=""
            collaboration={collaboration}
            onChange={handleChange}
            fill
            className="min-h-0 flex-1"
          />
        </>
      ) : (
        <div className="space-y-3 p-4" aria-busy="true">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      )}
    </MobileScreen>
  );
}
