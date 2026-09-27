import * as Y from "yjs";
import { type Converter, deterministicLineage } from "./converter.ts";
import { NoteNotFoundError, type NoteSnapshot, type NoteStore } from "./note-store.ts";
import type { RoomSpool } from "./persistence.ts";
import {
  ANYNOTE_STORED,
  CLOSE_NOT_FOUND,
  type CollabConnection,
  CollabDoc,
  LOCAL_ORIGIN,
  encodeAnynoteMessage,
} from "./protocol.ts";
import { parseRoom } from "./rooms.ts";

/** 外部写入合并进房间时的事务来源：照常广播并标脏，但不算任何客户端的编辑。 */
export const EXTERNAL_ORIGIN = Symbol("anynote-collab-external");
/** 从应急落盘恢复时的事务来源：标脏以便补写。 */
export const SPOOL_ORIGIN = Symbol("anynote-collab-spool");

export type NoteRoomManagerOptions = {
  store: NoteStore;
  converter: Converter;
  spool: RoomSpool;
  /** 最后一次更新后的静默期，默认 2 秒。 */
  debounceMs?: number;
  /** 距首次变脏的最长等待，默认 10 秒。 */
  maxDebounceMs?: number;
  /** 写库失败后的首次重试间隔，默认 2 秒，之后翻倍。 */
  backoffMinMs?: number;
  /** 退避上限，默认 60 秒。 */
  backoffMaxMs?: number;
  /** 连续版本冲突的合并重写上限，超过后改走退避，默认 3 次。 */
  maxConflictRetries?: number;
  onError?: (error: unknown, room: string) => void;
};

/** 已打开的房间：共享文档与它的谱系。 */
export type NoteRoom = { shared: CollabDoc; epoch: string; noteId: number };

type Entry = {
  room: string;
  noteId: number;
  shared: CollabDoc;
  epoch: string;
  /** 最近一次加载或写库成功时库里的版本号。 */
  baseVersion: string;
  /** 与 baseVersion 对应的 Y 状态，外部写入按它做三方合并。 */
  baseState: Uint8Array;
  /** 最近一次写库（或加载）时的 Markdown，内容没变就不写库。 */
  lastMarkdown: string;
  /** 最近一次写库（或加载）时的标题。 */
  lastTitle: string | null;
  dirty: boolean;
  firstDirtyAt: number | null;
  debounceTimer: NodeJS.Timeout | null;
  maxTimer: NodeJS.Timeout | null;
  retryTimer: NodeJS.Timeout | null;
  storing: Promise<void> | null;
  storeAgain: boolean;
  failures: number;
  conflictStreak: number;
  lastError: string | null;
  /** 上次写库成功之后在房间里编辑过的最后一位用户。 */
  lastEditor: number | null;
  editedSinceStore: boolean;
  editorSeq: number;
  deleted: boolean;
  /** 最后一个连接已离开、正在等写库成功后销毁。 */
  closing: boolean;
};

/**
 * 服务端落库模式下的房间管理：开房时从 note 服务加载，编辑防抖后写回 MySQL。
 *
 * - 开房：Y 状态与库里版本一致则直接恢复；过期则按差异更新到库里的内容；从没存过则由 Markdown 构建。
 *   三种情况都不标脏，打开笔记本身不写库。
 * - 写库：最后一次更新后静默 2 秒、首次变脏满 10 秒、最后一人离开、进程退出四者任一触发；
 *   序列化结果与上次相同则跳过；带基准版本号原子写回，A0409 时回读并三方合并后重写。
 * - 失败：保持脏状态按 2s → 60s 退避重试，不设放弃上限；最后一人离开时写库失败则保留房间继续重试；
 *   进程退出时仍失败的房间写入应急落盘，下次开房恢复并补写。
 */
export class NoteRoomManager {
  private readonly entries = new Map<string, Entry>();
  private readonly opening = new Map<string, Promise<Entry>>();
  private readonly store: NoteStore;
  private readonly converter: Converter;
  private readonly spool: RoomSpool;
  private readonly debounceMs: number;
  private readonly maxDebounceMs: number;
  private readonly backoffMinMs: number;
  private readonly backoffMaxMs: number;
  private readonly maxConflictRetries: number;
  private readonly onError: (error: unknown, room: string) => void;
  private lastStoreError: { room: string; message: string; at: number } | null = null;

  constructor(options: NoteRoomManagerOptions) {
    this.store = options.store;
    this.converter = options.converter;
    this.spool = options.spool;
    this.debounceMs = options.debounceMs ?? 2_000;
    this.maxDebounceMs = options.maxDebounceMs ?? 10_000;
    this.backoffMinMs = options.backoffMinMs ?? 2_000;
    this.backoffMaxMs = options.backoffMaxMs ?? 60_000;
    this.maxConflictRetries = options.maxConflictRetries ?? 3;
    this.onError = options.onError ?? (() => {});
  }

  /** 已打开（含等待写库后销毁）的房间数。 */
  get size(): number {
    return this.entries.size;
  }

  rooms(): string[] {
    return [...this.entries.keys()];
  }

  rejectedWrites(room: string): number {
    return this.entries.get(room)?.shared.rejectedWrites ?? 0;
  }

  /** `/healthz` 的写库指标：待写房间数、正在失败的房间与最近一次写库错误。 */
  health() {
    const failingRooms: Array<{ room: string; failures: number; lastError: string | null }> = [];
    let pendingStores = 0;
    for (const entry of this.entries.values()) {
      if (entry.dirty || entry.storing) pendingStores += 1;
      if (entry.failures > 0) {
        failingRooms.push({
          room: entry.room,
          failures: entry.failures,
          lastError: entry.lastError,
        });
      }
    }
    return { pendingStores, failingRooms, lastStoreError: this.lastStoreError };
  }

  /**
   * 打开房间；同一房间的并发打开共用一次加载。
   *
   * @throws {NoteNotFoundError} 笔记不存在或已删除
   */
  async open(room: string): Promise<NoteRoom> {
    const existing = this.entries.get(room);
    if (existing) {
      existing.closing = false;
      return this.toRoom(existing);
    }
    let pending = this.opening.get(room);
    if (!pending) {
      pending = this.load(room).finally(() => this.opening.delete(room));
      this.opening.set(room, pending);
    }
    return this.toRoom(await pending);
  }

  private toRoom(entry: Entry): NoteRoom {
    return { shared: entry.shared, epoch: entry.epoch, noteId: entry.noteId };
  }

  private async load(room: string): Promise<Entry> {
    const parsed = parseRoom(room);
    if (!parsed) throw new Error(`非法房间名：${room}`);
    const snapshot = await this.store.load(parsed.noteId);
    const shared = new CollabDoc(room);
    shared.onError = this.onError;
    const { epoch } = this.buildDocument(shared.doc, parsed.noteId, snapshot);

    const entry: Entry = {
      room,
      noteId: parsed.noteId,
      shared,
      epoch,
      baseVersion: snapshot.version,
      baseState: Y.encodeStateAsUpdate(shared.doc),
      lastMarkdown: this.converter.serialize(shared.doc).markdown,
      lastTitle: snapshot.title,
      dirty: false,
      firstDirtyAt: null,
      debounceTimer: null,
      maxTimer: null,
      retryTimer: null,
      storing: null,
      storeAgain: false,
      failures: 0,
      conflictStreak: 0,
      lastError: null,
      lastEditor: null,
      editedSinceStore: false,
      editorSeq: 0,
      deleted: false,
      closing: false,
    };

    shared.doc.on("update", (_update: Uint8Array, origin: unknown) => {
      if (origin === LOCAL_ORIGIN) return;
      // 编辑者在更新到达时同步记下，异步写库时读到的一定是这次更新的作者
      const conn = shared.conns.has(origin as CollabConnection)
        ? (origin as CollabConnection)
        : null;
      const userId = conn?.identity ? Number(conn.identity.userId) : Number.NaN;
      if (Number.isSafeInteger(userId) && userId > 0) {
        entry.lastEditor = userId;
        entry.editedSinceStore = true;
        entry.editorSeq += 1;
      }
      this.markDirty(entry);
    });

    await this.restoreSpool(entry);
    this.entries.set(room, entry);
    return entry;
  }

  /** 按快照构建房间文档（三个分支都以 LOCAL_ORIGIN 写入，不标脏）。 */
  private buildDocument(doc: Y.Doc, noteId: number, snapshot: NoteSnapshot): { epoch: string } {
    const markdown = this.converter.normalize(snapshot.content, snapshot.title);
    if (snapshot.state && snapshot.epoch && snapshot.stateVersion === snapshot.version) {
      Y.applyUpdate(doc, snapshot.state, LOCAL_ORIGIN);
      return { epoch: snapshot.epoch };
    }
    if (snapshot.state && snapshot.epoch) {
      // 房间关闭期间有外部写入：恢复旧状态后按差异更新到库里的内容，谱系不变
      Y.applyUpdate(doc, snapshot.state, LOCAL_ORIGIN);
      doc.transact(() => this.converter.applyMarkdown(doc, markdown), LOCAL_ORIGIN);
      return { epoch: snapshot.epoch };
    }
    // 从没存过 Y 状态：由 Markdown 确定性地构建，同一版本重复构建结果相同
    const lineage = deterministicLineage(noteId, snapshot.version);
    Y.applyUpdate(doc, this.converter.buildState(markdown, lineage.clientId), LOCAL_ORIGIN);
    return { epoch: lineage.epoch };
  }

  /** 恢复应急落盘：谱系一致则并入并标脏补写，不一致则留档。 */
  private async restoreSpool(entry: Entry): Promise<void> {
    let record: Awaited<ReturnType<RoomSpool["read"]>>;
    try {
      record = await this.spool.read(entry.room);
    } catch (error) {
      this.onError(error, entry.room);
      return;
    }
    if (!record) return;
    if (record.epoch !== entry.epoch) {
      this.onError(
        new Error(
          `应急落盘的谱系 ${record.epoch} 与房间谱系 ${entry.epoch} 不一致，已留档待人工处理`,
        ),
        entry.room,
      );
      await this.spool.quarantine(entry.room).catch((error) => this.onError(error, entry.room));
      return;
    }
    Y.applyUpdate(entry.shared.doc, record.state, SPOOL_ORIGIN);
    // 恢复的内容可能与库里相同（上次退出后其实写成功了），标脏后由写库时的内容比较决定是否写
    this.markDirty(entry);
  }

  private markDirty(entry: Entry): void {
    if (entry.deleted) return;
    entry.dirty = true;
    // 退避期间不另排防抖，由退避计时器负责下一次写库
    if (entry.retryTimer) return;
    if (entry.firstDirtyAt === null) {
      entry.firstDirtyAt = Date.now();
      entry.maxTimer = this.timer(() => void this.requestStore(entry), this.maxDebounceMs);
    }
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.debounceTimer = this.timer(() => void this.requestStore(entry), this.debounceMs);
  }

  private timer(run: () => void, ms: number): NodeJS.Timeout {
    const handle = setTimeout(run, ms);
    // 计时器不阻止进程退出，退出路径由 flushAll 收尾
    handle.unref?.();
    return handle;
  }

  private clearTimers(entry: Entry): void {
    for (const key of ["debounceTimer", "maxTimer", "retryTimer"] as const) {
      const handle = entry[key];
      if (handle) clearTimeout(handle);
      entry[key] = null;
    }
    entry.firstDirtyAt = null;
  }

  /** 串行化的写库入口：写库进行中再次请求时，等本次结束后若仍是脏状态再写一次。 */
  private requestStore(entry: Entry): Promise<void> {
    if (entry.storing) {
      entry.storeAgain = true;
      return entry.storing;
    }
    const running = this.runStore(entry).finally(() => {
      entry.storing = null;
      if (entry.storeAgain) {
        entry.storeAgain = false;
        if (entry.dirty && !entry.retryTimer) void this.requestStore(entry);
      }
      if (entry.closing) void this.destroyIfIdle(entry);
    });
    entry.storing = running;
    return running;
  }

  private async runStore(entry: Entry): Promise<void> {
    if (!entry.dirty || entry.deleted) return;
    this.clearTimers(entry);
    entry.dirty = false;

    const state = Y.encodeStateAsUpdate(entry.shared.doc);
    const seq = entry.editorSeq;
    const operatorId = entry.editedSinceStore ? entry.lastEditor : null;
    let serialized: { markdown: string; title: string | null };
    try {
      serialized = this.converter.serialize(entry.shared.doc);
    } catch (error) {
      this.fail(entry, error);
      return;
    }
    const { markdown, title } = serialized;
    if (markdown === entry.lastMarkdown && (title === null || title === entry.lastTitle)) {
      // 与库里一致（包括此前失败的写入其实已生效的情况）：无需写库，也不再算失败
      entry.baseState = state;
      entry.conflictStreak = 0;
      entry.failures = 0;
      entry.lastError = null;
      if (entry.editorSeq === seq) entry.editedSinceStore = false;
      await this.spool.remove(entry.room).catch(() => {});
      return;
    }

    let result: Awaited<ReturnType<NoteStore["store"]>>;
    try {
      result = await this.store.store(entry.noteId, {
        title,
        content: markdown,
        state,
        epoch: entry.epoch,
        baseVersion: entry.baseVersion,
        operatorId,
      });
    } catch (error) {
      if (error instanceof NoteNotFoundError) {
        this.handleDeleted(entry);
        return;
      }
      this.fail(entry, error);
      return;
    }

    if (result.ok) {
      entry.baseVersion = result.version;
      entry.baseState = state;
      entry.lastMarkdown = markdown;
      entry.lastTitle = title ?? entry.lastTitle;
      entry.failures = 0;
      entry.conflictStreak = 0;
      entry.lastError = null;
      if (entry.editorSeq === seq) entry.editedSinceStore = false;
      // 在线客户端据此刷新笔记列表与详情缓存里的标题、更新时间
      entry.shared.broadcast(
        encodeAnynoteMessage(ANYNOTE_STORED, { version: result.version, title: entry.lastTitle }),
      );
      await this.spool.remove(entry.room).catch(() => {});
      return;
    }

    // A0409：baseVersion 之后库里有外部写入，回读并合并后再写
    entry.dirty = true;
    try {
      await this.mergeFromStore(entry);
    } catch (error) {
      if (error instanceof NoteNotFoundError) {
        this.handleDeleted(entry);
        return;
      }
      this.fail(entry, error);
      return;
    }
    entry.conflictStreak += 1;
    if (entry.conflictStreak > this.maxConflictRetries) {
      this.fail(entry, new Error(`连续 ${entry.conflictStreak} 次版本冲突`));
      return;
    }
    await this.runStore(entry);
  }

  /** 写库失败：保持脏状态，按 2s → 60s 退避重试。 */
  private fail(entry: Entry, error: unknown): void {
    entry.dirty = true;
    entry.failures += 1;
    entry.lastError = error instanceof Error ? error.message : String(error);
    this.lastStoreError = { room: entry.room, message: entry.lastError, at: Date.now() };
    this.onError(error, entry.room);
    this.clearTimers(entry);
    const delay = Math.min(this.backoffMinMs * 2 ** (entry.failures - 1), this.backoffMaxMs);
    entry.retryTimer = this.timer(() => {
      entry.retryTimer = null;
      void this.requestStore(entry);
    }, delay);
  }

  /**
   * 回读库里的最新快照，若它比 baseVersion 新就并入房间：
   * 最新一次写入来自同一谱系的协同写回时按 Y 状态合并（条目身份不变，不会重复），
   * 否则是外部写入，按 Markdown 做三方合并。
   */
  private async mergeFromStore(entry: Entry): Promise<void> {
    const snapshot = await this.store.load(entry.noteId);
    if (snapshot.version === entry.baseVersion) return;
    if (
      snapshot.state &&
      snapshot.epoch === entry.epoch &&
      snapshot.stateVersion === snapshot.version
    ) {
      this.mergeState(entry, snapshot, snapshot.state);
      return;
    }
    this.mergeExternal(entry, snapshot);
  }

  /**
   * 同谱系合并：库里的 Y 状态来自协同写回（例如请求超时、实际已生效的那一次），
   * 直接按 CRDT 合并进房间，并把它作为新的基准。
   */
  private mergeState(entry: Entry, snapshot: NoteSnapshot, state: Uint8Array): void {
    Y.applyUpdate(entry.shared.doc, state, EXTERNAL_ORIGIN);
    const base = new Y.Doc({ gc: true });
    Y.applyUpdate(base, state);
    entry.baseState = state;
    entry.baseVersion = snapshot.version;
    entry.lastMarkdown = this.converter.serialize(base).markdown;
    entry.lastTitle = snapshot.title;
    base.destroy();
  }

  /**
   * 三方合并：用 baseState 复制一份临时文档，按差异更新成外部写入后的内容，
   * 再把「baseState → 外部内容」这部分差异作为一次普通更新应用到房间，
   * 房间里的并发编辑与外部改动由 CRDT 合并。
   */
  private mergeExternal(entry: Entry, snapshot: NoteSnapshot): void {
    const base = new Y.Doc({ gc: true });
    Y.applyUpdate(base, entry.baseState);
    const before = Y.encodeStateVector(base);
    this.converter.applyMarkdown(base, this.converter.normalize(snapshot.content, snapshot.title));
    const diff = Y.encodeStateAsUpdate(base, before);
    Y.applyUpdate(entry.shared.doc, diff, EXTERNAL_ORIGIN);
    entry.baseState = Y.encodeStateAsUpdate(base);
    entry.baseVersion = snapshot.version;
    entry.lastMarkdown = this.converter.serialize(base).markdown;
    entry.lastTitle = snapshot.title;
    base.destroy();
  }

  /**
   * 外部写入通知：房间在线时立即回读并合并，合并出的差异照常广播并标脏；
   * 房间不在内存里就忽略，下次开房时按库里的内容构建。
   *
   * @param noteId 被外部写入的笔记
   */
  async applyExternalUpdate(noteId: number): Promise<void> {
    const entry = [...this.entries.values()].find((item) => item.noteId === noteId);
    if (!entry || entry.deleted) return;
    if (entry.storing) await entry.storing;
    try {
      await this.mergeFromStore(entry);
    } catch (error) {
      if (error instanceof NoteNotFoundError) {
        this.handleDeleted(entry);
        return;
      }
      this.onError(error, entry.room);
    }
  }

  /** 笔记已删除：断开所有连接（4404），丢弃房间状态与应急落盘。 */
  private handleDeleted(entry: Entry): void {
    entry.deleted = true;
    entry.dirty = false;
    this.clearTimers(entry);
    for (const conn of [...entry.shared.conns.keys()]) {
      conn.close(CLOSE_NOT_FOUND, "note-deleted");
    }
    void this.spool.remove(entry.room).catch(() => {});
    this.destroy(entry);
  }

  /** 立即写库（若有未写的改动），返回的 Promise 在本次写库结束后 resolve。 */
  flush(room: string): Promise<void> {
    const entry = this.entries.get(room);
    if (!entry || !entry.dirty) return entry?.storing ?? Promise.resolve();
    if (entry.retryTimer) {
      clearTimeout(entry.retryTimer);
      entry.retryTimer = null;
    }
    return this.requestStore(entry);
  }

  /**
   * 最后一个连接离开后调用：先写库，成功且仍无人才销毁；写库失败则保留房间在后台继续重试。
   *
   * @returns 房间是否已销毁
   */
  async closeIfEmpty(room: string): Promise<boolean> {
    const entry = this.entries.get(room);
    if (!entry || entry.shared.conns.size > 0) return false;
    entry.closing = true;
    await this.flush(room);
    return this.destroyIfIdle(entry);
  }

  private async destroyIfIdle(entry: Entry): Promise<boolean> {
    if (this.entries.get(entry.room) !== entry) return true;
    if (!entry.closing || entry.shared.conns.size > 0) return false;
    if (entry.dirty || entry.storing) return false;
    this.destroy(entry);
    return true;
  }

  private destroy(entry: Entry): void {
    this.clearTimers(entry);
    if (this.entries.get(entry.room) === entry) this.entries.delete(entry.room);
    entry.shared.destroy();
  }

  /**
   * 进程退出前的收尾：所有脏房间各写一次库，总时长不超过 `timeoutMs`；
   * 仍未写成功的房间写入应急落盘。
   */
  async flushAll(timeoutMs = 20_000): Promise<void> {
    const entries = [...this.entries.values()];
    for (const entry of entries) {
      if (entry.retryTimer) {
        clearTimeout(entry.retryTimer);
        entry.retryTimer = null;
      }
    }
    const attempts = Promise.allSettled(
      entries
        .filter((entry) => entry.dirty || entry.storing)
        .map((entry) => this.requestStore(entry)),
    );
    await Promise.race([
      attempts,
      new Promise((resolve) => this.timer(() => resolve(null), timeoutMs)),
    ]);
    for (const entry of entries) {
      this.clearTimers(entry);
      if (!entry.dirty || entry.deleted) continue;
      try {
        await this.spool.write(entry.room, {
          epoch: entry.epoch,
          state: Y.encodeStateAsUpdate(entry.shared.doc),
        });
      } catch (error) {
        this.onError(error, entry.room);
      }
    }
  }
}
