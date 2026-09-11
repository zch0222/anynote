"use client";

import { type CollabRoomState, useCollabRoom } from "@/features/collab/use-collab-room";
import {
  COLLAB_INDEX_KEY,
  type CollabDocMeta,
  appendDocEntry,
  readDocIndex,
  removeDocEntry,
  renameDocEntry,
  touchDocEntry,
} from "@/lib/collab/index-doc";
import { COLLAB_INDEX_ROOM, createCollabDocId } from "@/lib/collab/rooms";
import { useCallback, useEffect, useState } from "react";
import type * as Y from "yjs";

export type CollabIndexState = CollabRoomState & {
  docs: CollabDocMeta[];
  createDoc: (title: string) => CollabDocMeta | null;
  renameDoc: (id: string, title: string) => boolean;
  touchDoc: (id: string) => boolean;
  removeDoc: (id: string) => boolean;
};

/**
 * 协同文档库的索引房间。列表本身也是协同数据：别人新建 / 改名 / 删除，
 * 这里的 docs 会实时跟着变，不需要任何后端接口或轮询。
 */
export function useCollabIndex(): CollabIndexState {
  const room = useCollabRoom(COLLAB_INDEX_ROOM);
  const { doc, user } = room;
  const [docs, setDocs] = useState<CollabDocMeta[]>([]);

  useEffect(() => {
    if (!doc) {
      setDocs([]);
      return;
    }
    const list = doc.getArray<Y.Map<unknown>>(COLLAB_INDEX_KEY);
    const sync = () => setDocs(readDocIndex(doc));
    // deep 观察：标题改在条目 Y.Map 内部，只听顶层数组是收不到的
    list.observeDeep(sync);
    sync();
    return () => list.unobserveDeep(sync);
  }, [doc]);

  const createDoc = useCallback(
    (title: string) => {
      if (!doc || !user) return null;
      const now = Date.now();
      const meta: CollabDocMeta = {
        id: createCollabDocId(),
        title,
        createdAt: now,
        updatedAt: now,
        createdBy: user.name,
      };
      appendDocEntry(doc, meta);
      return meta;
    },
    [doc, user],
  );

  const renameDoc = useCallback(
    (id: string, title: string) => (doc ? renameDocEntry(doc, id, title) : false),
    [doc],
  );

  const touchDoc = useCallback((id: string) => (doc ? touchDocEntry(doc, id) : false), [doc]);

  const removeDoc = useCallback((id: string) => (doc ? removeDocEntry(doc, id) : false), [doc]);

  return { ...room, docs, createDoc, renameDoc, touchDoc, removeDoc };
}
