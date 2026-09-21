import type * as Y from "yjs";

/**
 * 冷启动注入守卫（方案 D4）。
 *
 * 房间为空时由客户端把 REST 拿到的 Markdown 注入 Y.Doc。**不引入服务端选举**：
 * 两个客户端不可能同时满足「awareness 里只有我」——只要对方已连上，双方都能看到
 * 两个 clientID。`meta.seeded` 再挡一道「带本地状态重连的客户端」路径。
 *
 * 自愈性：唯一在场者在注入前掉线时房间回到空态，下一个进来的客户端会重新满足条件并注入，
 * 不存在「没人注入导致笔记显示为空」的死角。
 */

/** 共享 meta map 的键名。会话态：不落盘、不进 DB、房间销毁即消失。 */
export const COLLAB_META_KEY = "meta";
/** 冷启动注入守卫位：注入者在注入事务内置位。 */
export const COLLAB_SEEDED_KEY = "seeded";
/** 最近一次成功落库的版本令牌：在场客户端据此同步 versionRef，把常态 A0409 降到 0。 */
export const COLLAB_SAVED_VERSION_KEY = "savedVersion";

/** 条件持续满足多久才注入。600ms 足以让「两人几乎同时首连」在这条判定上互斥。 */
export const COLLAB_INJECT_SETTLE_MS = 600;

/**
 * 注入事务的 origin 标记。
 *
 * 保存排队刻意跳过这个 origin（见 `use-collab-note`）：注入的内容本就来自 DB，
 * 再排一次保存是纯写放大。
 */
export const COLLAB_INJECT_ORIGIN = Symbol("anynote-collab-inject");

export type InjectionGuardInput = {
  /** provider 已与服务端完成同步。未同步时的「空」不是真的空。 */
  synced: boolean;
  /** 房间内共享文档是否为空。 */
  isEmpty: boolean;
  /** 共享 meta 里的 seeded 标记。 */
  seeded: boolean | undefined;
  /** 当前 awareness 里的 clientID 集合（含自己）。 */
  peerClientIds: readonly number[];
  /** 自己的 clientID。 */
  selfClientId: number;
};

/**
 * 是否满足注入前置条件（纯函数，可穷举真值表）。
 *
 * 五条必须同时成立：已 synced、文档为空、没人 seeded、awareness 里只有我。
 * 「持续 SETTLE_MS」这条是时间维度的收敛，由 hook 用定时器负责，不进这个纯函数。
 */
export function shouldInject(input: InjectionGuardInput): boolean {
  if (!input.synced) return false;
  if (!input.isEmpty) return false;
  if (input.seeded === true) return false;
  return input.peerClientIds.length === 1 && input.peerClientIds[0] === input.selfClientId;
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

/** 写入「最近一次成功落库的版本令牌」。保存成功的客户端调用。 */
export function writeSavedVersion(doc: Y.Doc, version: string): void {
  collabMeta(doc).set(COLLAB_SAVED_VERSION_KEY, version);
}
