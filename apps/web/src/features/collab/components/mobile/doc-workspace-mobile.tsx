"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import type { CollaborationBinding } from "@/components/editor/presets/types";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { PanelSkeleton } from "@/components/loading/skeletons";
import { ConnectionBanner, NotFoundState, QueryError } from "@/components/shared/states";
import { Input } from "@/components/ui/input";
import { CollabPresence, CollabStatusBadge } from "@/features/collab/components/collab-status";
import { useCollabIndex } from "@/features/collab/use-collab-index";
import { useCollabRoom } from "@/features/collab/use-collab-room";
import { collabDocRoom } from "@/lib/collab/rooms";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** 正文停止变动多久后才把 updatedAt 写回索引，避免每次击键都广播一次索引更新。 */
const TOUCH_DEBOUNCE_MS = 2_000;

/**
 * 协同文档没有配置图片上传（MinIO 方案 D3「本期不接」）。
 *
 * 与其让按钮可点后弹「当前编辑器未配置图片上传」，不如直接置灰（M-09 图例 9）——
 * 「点一次才知道不行」等于用报错替代了说明。
 */
const DISABLED_COMMANDS = ["image"] as const;

/**
 * `/m/docs/[id]`：协同文档的移动端编辑页（M-09）。
 *
 * 与桌面同样连两个房间（正文 + 索引），数据逻辑一行不改；差别是版式：
 * 标题进正文区顶部、在线状态与连接状态收进顶栏、编辑器用 `toolbar="mobile"`。
 *
 * 「重新连接」直接用 `useCollabRoom` 暴露的 `reconnect()`：它内部只重建连接、
 * 保留同一个 Y.Doc，本地的未同步改动不会丢。自己重挂组件会让 Y.Doc 一起重建，
 * 那是"刷新页面"而不是"重连"。
 */
export function MobileDocWorkspace({ docId }: { docId: string }) {
  const room = useMemo(() => collabDocRoom(docId), [docId]);
  const content = useCollabRoom(room);
  const index = useCollabIndex();
  const onReconnect = content.reconnect;

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

  /**
   * 是否**曾经**连上过。
   *
   * 首次进入时 `status` 也是 `connecting`，直接按它渲染会在一进页面就闪一条
   * 「连接已断开」——那句提示的语义是"刚刚掉的线"，不是"正在连"。
   */
  const everConnected = useRef(false);
  if (content.status === "connected") everConnected.current = true;
  const showDisconnected = everConnected.current && content.status === "connecting";

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
   * 「文档已移除」（同 12.5.2）：索引已同步完成，但列表里没有这条。
   *
   * 必须等索引真的连上再判——索引还没同步时 `docs` 是空数组，
   * 那时候下结论会把每个正常打开的文档都判成"已移除"。
   */
  const removed = index.status === "connected" && index.docs.length > 0 && !meta;

  return (
    <MobileScreen
      title={<CollabStatusBadge status={content.status} />}
      back="/m/docs"
      actions={<CollabPresence peers={content.peers} />}
      fill
      contentClassName="min-h-0"
    >
      {content.status === "error" ? (
        <div className="p-4">
          <QueryError
            object="协同服务"
            message="协同服务暂时连不上，稍后重试。"
            onRetry={onReconnect}
          />
        </div>
      ) : removed ? (
        <NotFoundState object="文档" backHref="/m/docs" backLabel="回到文档库" />
      ) : collaboration ? (
        <>
          {/* M-09 图例 12：断线时标题下 40 高 warning 提示条 + 「重新连接」 */}
          {showDisconnected ? (
            <div className="shrink-0 px-4 pt-3">
              <ConnectionBanner reconnecting={false} onReconnect={onReconnect} />
            </div>
          ) : null}
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
            disabledCommands={DISABLED_COMMANDS}
            value=""
            collaboration={collaboration}
            onChange={handleChange}
            fill
            className="min-h-0 flex-1"
          />
        </>
      ) : (
        <div className="p-4">
          <PanelSkeleton />
        </div>
      )}
    </MobileScreen>
  );
}
