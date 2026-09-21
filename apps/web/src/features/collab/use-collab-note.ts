import { useCollabRoom } from "@/features/collab/use-collab-room";
import { injectInitialContent, isCollabDocEmpty } from "@/lib/collab/inject";
import {
  COLLAB_INJECT_SETTLE_MS,
  collabMeta,
  isCollabInternalOrigin,
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
   * 本地编辑信号。**远端广播、冷启动注入与 meta 写入都不触发**（§7.3.1）：
   * 这让「一个人打字」不会让在场每个人都排一次保存，写放大从人头数降到 1。
   *
   * 刻意**不带正文参数**：ySyncPlugin 先把改动写进 Y.Doc、TipTap 才发 `onUpdate`，
   * 所以此刻调用方手里的正文快照恒落后一次击键。调用方应当只记一个「下一拍
   * `onChange` 是本地编辑」的标记，正文取 `onChange` 带来的那一份。
   */
  onLocalEdit?: (() => void) | undefined;
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
  /**
   * 房间正文已就位（已注入或本来就非空），可以放手编辑。
   *
   * 协同模式下正文的唯一真相是 Y.Doc，而它在「连上但还没注入」这段时间里是空的。
   * 此时放开编辑，用户会对着一个空白编辑器打字，那一拍保存就把库里的正文覆盖掉。
   */
  contentReady: boolean;
  /** 编辑器是否可写。非协同与降级后恒为 true（回到单人链路）。 */
  editable: boolean;
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
  const { noteId, enabled, editor, markdown, onLocalEdit } = options;
  const room = useMemo(() => (enabled ? collabNoteRoom(noteId) : null), [enabled, noteId]);
  const { doc, provider, user, status, peers, reconnect } = useCollabRoom(room);

  const [savedVersion, setSavedVersion] = useState<string | null>(null);
  const [contentReady, setContentReady] = useState(false);
  const changeRef = useRef(onLocalEdit);
  changeRef.current = onLocalEdit;

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
   * 正文就位判定。连接中（还没有 doc）一律未就位——那段时间编辑器跑的是单人预设，
   * 放开编辑的话这些击键会在协同绑定建立、编辑器重建时被整段丢掉。
   */
  useEffect(() => {
    if (!enabled) {
      setContentReady(true);
      return;
    }
    if (!doc) {
      setContentReady(false);
      return;
    }
    // 没有待注入的正文（新笔记 / 空正文）就没有等待的对象
    const evaluate = () => setContentReady(!markdown || !isCollabDocEmpty(doc));
    evaluate();
    doc.on("update", evaluate);
    return () => doc.off("update", evaluate);
  }, [enabled, doc, markdown]);

  /**
   * 冷启动注入守卫（D4）。
   *
   * 四条条件同时成立、且持续 `SETTLE_MS` 才注入。任一条件不成立立刻取消倒计时；
   * 倒计时到点**再判一次**——事件驱动的取消依赖「每个条件都有对应事件」，
   * 多一道即时复判比逐条论证事件覆盖面便宜得多。
   */
  useEffect(() => {
    if (!doc || !provider || !editor || !markdown) return;
    const meta = collabMeta(doc);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    const eligible = () =>
      shouldInject({
        synced: provider.synced,
        isEmpty: isCollabDocEmpty(doc),
        seeded: meta.get("seeded") === true,
        peerClientIds: [...provider.awareness.getStates().keys()],
        selfClientId: doc.clientID,
      });

    const evaluate = () => {
      if (done) return;
      if (!eligible()) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        return;
      }
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (done || !eligible()) return;
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

  /** 保存排队过滤：只有**本地编辑**触发；远端广播、注入与 meta 写入都不触发。 */
  useEffect(() => {
    if (!doc || !provider) return;
    const handler = (_update: Uint8Array, origin: unknown) => {
      if (origin === provider) return;
      if (isCollabInternalOrigin(origin)) return;
      changeRef.current?.();
    };
    doc.on("update", handler);
    return () => doc.off("update", handler);
  }, [doc, provider]);

  const publishSavedVersion = useCallback(
    (version: string | null) => {
      if (!doc || !version) return;
      writeSavedVersion(doc, version);
    },
    [doc],
  );

  const degraded = status === "error";
  const active = Boolean(enabled && doc && provider);

  return {
    active,
    doc,
    provider,
    user,
    connected: status === "connected",
    degraded,
    contentReady,
    // 降级后回到单人链路，此时不该再锁着编辑器不让人写
    editable: !enabled || degraded || contentReady,
    peers,
    savedVersion,
    publishSavedVersion,
    reconnect,
  };
}
