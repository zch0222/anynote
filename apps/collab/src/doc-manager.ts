import * as Y from "yjs";
import type { CollabPersistence } from "./persistence.ts";
import { CollabDoc, LOCAL_ORIGIN } from "./protocol.ts";

export type DocManagerOptions = {
  persistence: CollabPersistence;
  /** 更新到落盘之间的静默期；连续编辑只会在停手后写一次。 */
  saveDebounceMs?: number;
  onError?: (error: unknown, room: string) => void;
};

type Entry = {
  shared: CollabDoc;
  timer: NodeJS.Timeout | null;
  /** 串行化写入：同一房间的落盘永远排队，不会两次写交叉。 */
  writing: Promise<void>;
  dirty: boolean;
};

/**
 * 房间生命周期管理：按需打开、加载持久化状态、防抖落盘、无人时关闭。
 *
 * 关闭房间前一定要 flush，否则最后一段编辑会丢——这是唯一真正危险的路径，
 * 所以 `closeIfEmpty` 是 async 且调用方必须 await。
 */
export class CollabDocManager {
  private readonly entries = new Map<string, Entry>();
  private readonly opening = new Map<string, Promise<CollabDoc>>();
  private readonly persistence: CollabPersistence;
  private readonly saveDebounceMs: number;
  private readonly onError: (error: unknown, room: string) => void;

  constructor(options: DocManagerOptions) {
    this.persistence = options.persistence;
    this.saveDebounceMs = options.saveDebounceMs ?? 2_000;
    this.onError = options.onError ?? (() => {});
  }

  /** 已打开的房间数，供 /healthz 与测试观察。 */
  get size(): number {
    return this.entries.size;
  }

  open(room: string): Promise<CollabDoc> {
    const existing = this.entries.get(room);
    if (existing) return Promise.resolve(existing.shared);

    const pending = this.opening.get(room);
    if (pending) return pending;

    const loading = this.load(room).finally(() => this.opening.delete(room));
    this.opening.set(room, loading);
    return loading;
  }

  private async load(room: string): Promise<CollabDoc> {
    const shared = new CollabDoc(room);
    shared.onError = this.onError;
    try {
      const state = await this.persistence.read(room);
      if (state && state.length > 0) {
        Y.applyUpdate(shared.doc, state, LOCAL_ORIGIN);
      }
    } catch (error) {
      // 读失败不能让房间开不起来：退化成空文档，并把错误抛给调用方记录。
      this.onError(error, room);
    }

    const entry: Entry = { shared, timer: null, writing: Promise.resolve(), dirty: false };
    shared.doc.on("update", (_update: Uint8Array, origin: unknown) => {
      // 加载自身持久化状态产生的 update 不算「脏」，否则每次开房都要多写一次。
      if (origin === LOCAL_ORIGIN) return;
      entry.dirty = true;
      this.schedule(room, entry);
    });

    this.entries.set(room, entry);
    return shared;
  }

  private schedule(room: string, entry: Entry) {
    if (entry.timer) return;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void this.flush(room);
    }, this.saveDebounceMs);
    // 定时器不应阻止进程退出，退出路径由 flushAll 负责收尾。
    entry.timer.unref?.();
  }

  /** 立刻落盘（若有变更）。返回的 Promise 在写入真正完成后 resolve。 */
  flush(room: string): Promise<void> {
    const entry = this.entries.get(room);
    if (!entry || !entry.dirty) return Promise.resolve();

    entry.dirty = false;
    const state = Y.encodeStateAsUpdate(entry.shared.doc);
    entry.writing = entry.writing
      .then(() => this.persistence.write(room, state))
      .catch((error) => this.onError(error, room));
    return entry.writing;
  }

  /** 房间已无连接时落盘并销毁；仍有连接则什么都不做。 */
  async closeIfEmpty(room: string): Promise<boolean> {
    const entry = this.entries.get(room);
    if (!entry || entry.shared.conns.size > 0) return false;

    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    await this.flush(room);
    await entry.writing;
    entry.shared.destroy();
    this.entries.delete(room);
    return true;
  }

  /** 进程退出前把所有房间刷盘。 */
  async flushAll(): Promise<void> {
    await Promise.all(
      [...this.entries.keys()].map(async (room) => {
        await this.flush(room);
        await this.entries.get(room)?.writing;
      }),
    );
  }
}
