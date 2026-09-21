import type * as Y from "yjs";

/**
 * 冷启动注入守卫（方案 D4）。
 *
 * 房间为空时由客户端把 REST 拿到的 Markdown 注入 Y.Doc。**不引入服务端选举**：
 * 由在场各端对同一份 awareness 做**确定性选举**（clientID 最小者注入），
 * 所有端看到同一组 clientID，结论必然一致。`meta.seeded` 再挡一道
 * 「带本地状态重连的客户端」路径。
 *
 * 自愈性：被选中者在注入前掉线时房间回到空态，剩下的人里 clientID 最小的那个
 * 会重新满足条件并注入，不存在「没人注入导致笔记显示为空」的死角。
 *
 * **为什么不是「awareness 里只有我」**：那条规则在两端几乎同时首连时会让
 * 双方互相让路——A 看见 B、B 看见 A，于是**谁都不注入**，房间永远停在空态，
 * 两端都显示空白正文；用户对着空白编辑器打字，那一拍保存会把库里的正文覆盖掉。
 * 实测触发条件只是「第二端在 1 秒内进来」（含同一用户开两个标签页、手机与桌面
 * 同时打开），不是边角情况。确定性选举把「互相让路」换成「一定有且通常只有一人动手」。
 */

/** 共享 meta map 的键名。会话态：不落盘、不进 DB、房间销毁即消失。 */
export const COLLAB_META_KEY = "meta";
/** 冷启动注入守卫位：注入者在注入事务内置位。 */
export const COLLAB_SEEDED_KEY = "seeded";
/** 最近一次成功落库的版本令牌：在场客户端据此同步 versionRef，把常态 A0409 降到 0。 */
export const COLLAB_SAVED_VERSION_KEY = "savedVersion";

/** 条件持续满足多久才注入。600ms 足以让 awareness 在选举前收敛到同一组 clientID。 */
export const COLLAB_INJECT_SETTLE_MS = 600;

/**
 * 注入事务的 origin 标记。
 *
 * 保存排队刻意跳过这个 origin（见 `use-collab-note`）：注入的内容本就来自 DB，
 * 再排一次保存是纯写放大。**正文注入与 `seeded` 必须同在一个带此 origin 的事务里**，
 * 否则正文那一半会带着 ySyncPlugin 的 origin 逃过过滤，让「打开笔记」本身变成一次写入。
 */
export const COLLAB_INJECT_ORIGIN = Symbol("anynote-collab-inject");

/**
 * 共享 meta 写入的 origin 标记。
 *
 * `meta.savedVersion` 是会话态、不是正文编辑，写它不该排一次保存。
 * 不打这个标记的话：保存成功 → 写 meta → Y.Doc 触发 update → 再排一次保存，
 * 每个编辑批次固定多一个来回。
 */
export const COLLAB_META_ORIGIN = Symbol("anynote-collab-meta");

/** 协同运行时自己发起的写入（注入 / meta），一律不算「本地编辑」。 */
export function isCollabInternalOrigin(origin: unknown): boolean {
  return origin === COLLAB_INJECT_ORIGIN || origin === COLLAB_META_ORIGIN;
}

export type InjectionGuardInput = {
  /** provider 已与服务端完成同步。未同步时的「空」不是真的空。 */
  synced: boolean;
  /** 房间内共享文档是否为空。 */
  isEmpty: boolean;
  /** 共享 meta 里的 seeded 标记。 */
  seeded: boolean | undefined;
  /** 当前 awareness 里的 clientID 集合（正常情况下含自己）。 */
  peerClientIds: readonly number[];
  /** 自己的 clientID。 */
  selfClientId: number;
};

/**
 * 是否满足注入前置条件（纯函数，可穷举真值表）。
 *
 * 四条必须同时成立：已 synced、文档为空、没人 seeded、**我是选中的那一个**。
 * 「持续 SETTLE_MS」这条是时间维度的收敛，由 hook 用定时器负责，不进这个纯函数。
 */
export function shouldInject(input: InjectionGuardInput): boolean {
  if (!input.synced) return false;
  if (!input.isEmpty) return false;
  if (input.seeded === true) return false;
  return electInjector(input.peerClientIds, input.selfClientId) === input.selfClientId;
}

/**
 * 确定性选举：在场 clientID 最小者负责注入。
 *
 * 把自己也并进候选集，这样「awareness 还没回灌自己的状态」时不会选出一个空结果
 * 而让所有人都袖手旁观。awareness 尚未收敛时两端可能各自选出自己（内容重复，
 * 可由笔记历史恢复）——这比「谁都不注入」（空白 + 打字即覆盖正文）轻得多，
 * 且 `COLLAB_INJECT_SETTLE_MS` 的静默窗口足以让 awareness 收敛到同一组。
 */
export function electInjector(peerClientIds: readonly number[], selfClientId: number): number {
  let elected = selfClientId;
  for (const clientId of peerClientIds) {
    if (clientId < elected) elected = clientId;
  }
  return elected;
}

/** 共享 meta map（`Y.Map("meta")`）。 */
export function collabMeta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(COLLAB_META_KEY);
}

/** 读取「最近一次成功落库的版本令牌」，非法值一律当没有。 */
export function readSavedVersion(doc: Y.Doc): string | null {
  const value = collabMeta(doc).get(COLLAB_SAVED_VERSION_KEY);
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * 写入「最近一次成功落库的版本令牌」。保存成功的客户端调用。
 *
 * 走 `COLLAB_META_ORIGIN` 事务：它是会话态而非正文编辑，不该触发保存排队。
 */
export function writeSavedVersion(doc: Y.Doc, version: string): void {
  doc.transact(() => {
    collabMeta(doc).set(COLLAB_SAVED_VERSION_KEY, version);
  }, COLLAB_META_ORIGIN);
}
