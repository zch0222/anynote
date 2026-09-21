import { useCollabRoom } from "@/features/collab/use-collab-room";
import { injectInitialContent, isCollabDocEmpty } from "@/lib/collab/inject";
import {
  COLLAB_INJECT_ORIGIN,
  COLLAB_INJECT_SETTLE_MS,
  collabMeta,
  readSavedVersion,
  shouldInject,
  writeSavedVersion,
} from "@/lib/collab/injection";
import { collabNoteRoom } from "@/lib/collab/rooms";
import type { CollabUser } from "@/lib/collab/session";
import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type UseCollabNoteOptions = {
  noteId: number;
  /** 总开关（`NEXT_PUBLIC_COLLAB_NOTES`）且权限 ≥ EDIT 时为 true。 */
  enabled: boolean;
  /** 编辑器就绪后的实例；未就绪传 null，协同仍会连接但暂不注入。 */
  editor: Editor | null;
  /** REST 拿到的正文（含补齐的顶部 H1），注入守卫通过时用它灌进空房间。 */
  markdown: string | null;
  /**
   * 本地编辑产生改动时回调。**远端广播与冷启动注入都不触发**（§7.3.1）：
   * 这让「一个人打字」不会让在场每个人都排一次保存，写放大从人头数降到 1。
   */
  onLocalChange?: (editor: Editor) => void;
};

export type CollabNoteState = {
  /** 协同运行时可用（开关打开且 provider 已建立）。 */
  active: boolean;
  /** 房间的 Y.Doc；未连接时为 null。供编辑器 preset 建 Collaboration 绑定。 */
  doc: import("yjs").Doc | null;
  /** y-websocket provider；未连接时为 null。 */
  provider: import("y-websocket").WebsocketProvider | null;
  /** 本人身份。 */
  user: CollabUser | null;
  /** 连接正常。状态徽标与保存文案据此显示「已同步」。 */
  connected: boolean;
  /** 连接降级（连不上 / 令牌签发失败），页面据此提示并回退单人模式。 */
  degraded: boolean;
  peers: ReturnType<typeof useCollabRoom>["peers"];
  /** 共享 meta 的已落库版本号，直接喂给 `useSaveNote` 的 `sharedVersion`。 */
  savedVersion: string | null;
  /** 保存成功后把新版本号写进共享 meta，广播给在场各端。 */
  publishSavedVersion: (version: string | null) => void;
  reconnect: () => void;
};

/**
 * 笔记协同运行时（方案 §7.2）：房间连接 → 注入守卫（D4）→ 保存排队过滤（§7.3.1）。
 *
 * 连接 / 重连 / `synced` 语义全部复用 `useCollabRoom`，只是 room 从 `doc:<uuid>`
 * 换成 `note:<id>`。守卫与 origin 过滤在这里收口，编辑器核心一行不改。
 */
export function useCollabNote(options: UseCollabNoteOptions): CollabNoteState {
  const { noteId, enabled, editor, markdown, onLocalChange } = options;
  const room = useMemo(() => (enabled ? collabNoteRoom(noteId) : null), [enabled, noteId]);
  const { doc, provider, user, synced, status, peers, reconnect } = useCollabRoom(room);

  const [savedVersion, setSavedVersion] = useState<string | null>(null);
  const changeRef = useRef(onLocalChange);
  changeRef.current = onLocalChange;

  // 共享 meta.savedVersion 同步到本地 state：别人存过，我就拿到最新版本号
  useEffect(() => {
    if (!doc) {
      setSavedVersion(null);
      return;
    }
    const meta = collabMeta(doc);
    const sync = () => setSavedVersion(readSavedVersion(doc));
    sync();
    // 只订阅 meta 子树：正文更新不必惊动版本号订阅者
    meta.observe(sync);
    return () => meta.unobserve(sync);
  }, [doc]);

  /**
   * 冷启动注入守卫（D4）。
   *
   * 五条条件同时成立、且持续 `SETTLE_MS` 才注入。任一条件不成立立刻取消倒计时——
   * 「持续满足」才是有意义的，条件中途失效还继续注入会把两个人的首次内容叠在一起。
   */
  useEffect(() => {
    if (!doc || !provider || !editor || !markdown) return;
    const meta = collabMeta(doc);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    const evaluate = () => {
      if (done) return;
      const ok = shouldInject({
        synced: provider.synced,
        isEmpty: isCollabDocEmpty(doc),
        seeded: meta.get("seeded") === true,
        peerClientIds: [...provider.awareness.getStates().keys()],
        selfClientId: doc.clientID,
      });
      if (!ok) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        return;
      }
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        done = true;
        injectInitialContent(editor, markdown, doc);
      }, COLLAB_INJECT_SETTLE_MS);
    };

    evaluate();
    doc.on("update", evaluate);
    meta.observe(evaluate);
    provider.on("sync", evaluate);
    provider.awareness.on("change", evaluate);
    return () => {
      if (timer) clearTimeout(timer);
      doc.off("update", evaluate);
      meta.unobserve(evaluate);
      provider.off("sync", evaluate);
      provider.awareness.off("change", evaluate);
    };
  }, [doc, provider, editor, markdown]);

  /** 保存排队过滤：只有**本地**编辑触发；远端广播与注入都不触发。 */
  useEffect(() => {
    if (!doc || !provider) return;
    const handler = (_update: Uint8Array, origin: unknown) => {
      if (origin === provider) return;
      if (origin === COLLAB_INJECT_ORIGIN) return;
      if (editor) changeRef.current?.(editor);
    };
    doc.on("update", handler);
    return () => doc.off("update", handler);
  }, [doc, provider, editor]);

  const publishSavedVersion = useCallback(
    (version: string | null) => {
      if (!doc || !version) return;
      writeSavedVersion(doc, version);
    },
    [doc],
  );

  return {
    active: Boolean(enabled && doc && provider),
    doc,
    provider,
    user,
    connected: status === "connected",
    degraded: status === "error",
    peers,
    savedVersion,
    publishSavedVersion,
    reconnect,
  };
}
