import * as idb from "lib0/indexeddb";
import * as Y from "yjs";

/** 每篇笔记一个本地库：`anynote-note-<noteId>`。 */
export const LOCAL_NOTE_DB_PREFIX = "anynote-note-";
/** 超过这么久没打开的本地库在下次启动时清理。 */
export const LOCAL_NOTE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** 更新条数超过这个值时合并成一条全量状态。 */
export const LOCAL_NOTE_COMPACT_THRESHOLD = 500;

const UPDATES_STORE = "updates";
const CUSTOM_STORE = "custom";
const EPOCH_KEY = "epoch";
const OPEN_TIMEOUT_MS = 3_000;
/** 记录各本地库最后打开时间的索引（只含笔记 id 与时间戳），用于保留期清理与退出登录清理。 */
const INDEX_STORAGE_KEY = "anynote-note-cache-index";

/**
 * 一篇笔记在浏览器里的本地副本：Y 文档的全部更新与它所属的谱系。
 *
 * 打不开（无痕模式、被禁用）或写入失败（配额不足、事务中止）时自动停用，
 * `available` 变为 false 并通知监听者，界面据此切换「改动会不会丢」的提示。
 */
export type LocalNoteStore = {
  /** 从本地库载入更新时使用的事务来源，同步状态据此把它排除在「本地编辑」之外。 */
  readonly origin: object;
  /** 本地持久化当前是否可用。 */
  readonly available: boolean;
  /**
   * 把本地库里的更新应用到文档，之后开始记录文档的每次更新。
   *
   * @returns 是否载入了内容
   */
  load(): Promise<boolean>;
  /** 读取本地副本所属的谱系；没有记录时为 null。 */
  getEpoch(): Promise<string | null>;
  /** 记录本地副本所属的谱系。 */
  setEpoch(epoch: string): Promise<void>;
  /** 停用时回调；返回取消订阅函数。 */
  onDisabled(listener: () => void): () => void;
  /** 删除这篇笔记的本地库（谱系不符、笔记已删除时调用）。 */
  clear(): Promise<void>;
  /** 停止记录并关闭连接，本地库保留。 */
  destroy(): void;
};

function dbName(noteId: number): string {
  return `${LOCAL_NOTE_DB_PREFIX}${noteId}`;
}

function readIndex(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(INDEX_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeIndex(index: Record<string, number>): void {
  try {
    window.localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(index));
  } catch {
    // 本地存储不可用时只影响保留期清理
  }
}

function recordOpened(noteId: number, now = Date.now()): void {
  writeIndex({ ...readIndex(), [String(noteId)]: now });
}

function forget(noteId: number): void {
  const index = readIndex();
  delete index[String(noteId)];
  writeIndex(index);
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("打开本地库超时")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** 本地持久化不可用时的替身：什么都不存，`available` 恒为 false。 */
function disabledStore(): LocalNoteStore {
  const origin = {};
  return {
    origin,
    available: false,
    load: async () => false,
    getEpoch: async () => null,
    setEpoch: async () => {},
    onDisabled: () => () => {},
    clear: async () => {},
    destroy: () => {},
  };
}

/**
 * 打开一篇笔记的本地副本。IndexedDB 不可用或打开失败时返回停用状态的替身，不抛错。
 *
 * @param noteId 笔记 id
 * @param doc 协同会话的 Y 文档
 */
export async function openLocalNoteStore(noteId: number, doc: Y.Doc): Promise<LocalNoteStore> {
  if (!hasIndexedDb()) return disabledStore();
  const name = dbName(noteId);
  let db: IDBDatabase;
  try {
    db = await withTimeout(
      idb.openDB(name, (database) =>
        idb.createStores(database, [[UPDATES_STORE, { autoIncrement: true }], [CUSTOM_STORE]]),
      ),
      OPEN_TIMEOUT_MS,
    );
  } catch {
    return disabledStore();
  }
  recordOpened(noteId);

  const origin = {};
  const listeners = new Set<() => void>();
  let available = true;
  let subscribed = false;
  let pendingWrites = 0;
  let compacting = false;

  const disable = () => {
    if (!available) return;
    available = false;
    unsubscribe();
    try {
      db.close();
    } catch {
      // 已经关闭
    }
    for (const listener of listeners) listener();
  };

  const compact = async () => {
    if (compacting || !available) return;
    compacting = true;
    try {
      const [updates] = idb.transact(db, [UPDATES_STORE]);
      if (!updates) return;
      const lastKey = await idb.getLastKey(updates);
      await idb.addAutoKey(updates, Y.encodeStateAsUpdate(doc) as unknown as ArrayBuffer);
      if (lastKey !== undefined && lastKey !== null) {
        await idb.del(updates, idb.createIDBKeyRangeUpperBound(lastKey, false));
      }
      pendingWrites = 0;
    } catch {
      disable();
    } finally {
      compacting = false;
    }
  };

  const handleUpdate = (update: Uint8Array, updateOrigin: unknown) => {
    if (updateOrigin === origin || !available) return;
    try {
      const [updates] = idb.transact(db, [UPDATES_STORE]);
      if (!updates) return;
      idb
        // lib0 的类型声明不含 Uint8Array，实际按结构化克隆原样存储
        .addAutoKey(updates, update as unknown as ArrayBuffer)
        .then(() => {
          pendingWrites += 1;
          if (pendingWrites >= LOCAL_NOTE_COMPACT_THRESHOLD) void compact();
        })
        .catch(disable);
    } catch {
      disable();
    }
  };

  function unsubscribe() {
    if (!subscribed) return;
    doc.off("update", handleUpdate);
    subscribed = false;
  }

  const readCustom = async (key: string): Promise<unknown> => {
    if (!available) return null;
    try {
      const [custom] = idb.transact(db, [CUSTOM_STORE], "readonly");
      return custom ? await idb.get(custom, key) : null;
    } catch {
      disable();
      return null;
    }
  };

  return {
    origin,
    get available() {
      return available;
    },

    async load() {
      let loaded = false;
      try {
        const [updates] = idb.transact(db, [UPDATES_STORE], "readonly");
        const stored = updates ? ((await idb.getAll(updates)) as Uint8Array[]) : [];
        if (stored.length > 0) {
          doc.transact(() => {
            for (const update of stored) Y.applyUpdate(doc, update);
          }, origin);
          loaded = true;
          pendingWrites = stored.length;
        }
      } catch {
        disable();
        return false;
      }
      if (available && !subscribed) {
        doc.on("update", handleUpdate);
        subscribed = true;
        // 当前文档里已有、但本地库还没有的内容（例如启用本地持久化之前同步到的正文）一并存下
        if (!loaded && doc.store.clients.size > 0) {
          handleUpdate(Y.encodeStateAsUpdate(doc), null);
        }
      }
      return loaded;
    },

    async getEpoch() {
      const value = await readCustom(EPOCH_KEY);
      return typeof value === "string" && value !== "" ? value : null;
    },

    async setEpoch(epoch) {
      if (!available) return;
      try {
        const [custom] = idb.transact(db, [CUSTOM_STORE]);
        if (custom) await idb.put(custom, epoch, EPOCH_KEY);
      } catch {
        disable();
      }
    },

    onDisabled(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async clear() {
      unsubscribe();
      available = false;
      try {
        db.close();
      } catch {
        // 已经关闭
      }
      forget(noteId);
      await idb.deleteDB(name).catch(() => undefined);
    },

    destroy() {
      unsubscribe();
      try {
        db.close();
      } catch {
        // 已经关闭
      }
    },
  };
}

/** 删除一篇笔记的本地库（不需要先打开）。 */
export async function deleteLocalNote(noteId: number): Promise<void> {
  forget(noteId);
  if (!hasIndexedDb()) return;
  await idb.deleteDB(dbName(noteId)).catch(() => undefined);
}

/** 这篇笔记在本浏览器里是否有本地副本（按最后打开记录判断，不打开数据库）。 */
export function hasLocalNote(noteId: number): boolean {
  return String(noteId) in readIndex();
}

/**
 * 删除本浏览器里全部笔记本地库。退出登录时调用，避免共用电脑上留下笔记正文。
 */
export async function clearAllLocalNotes(): Promise<void> {
  const ids = new Set(Object.keys(readIndex()));
  if (hasIndexedDb() && typeof indexedDB.databases === "function") {
    try {
      for (const info of await indexedDB.databases()) {
        if (info.name?.startsWith(LOCAL_NOTE_DB_PREFIX)) {
          ids.add(info.name.slice(LOCAL_NOTE_DB_PREFIX.length));
        }
      }
    } catch {
      // 不支持枚举时只清理索引里记录过的库
    }
  }
  writeIndex({});
  if (!hasIndexedDb()) return;
  await Promise.all(
    [...ids].map((id) => idb.deleteDB(`${LOCAL_NOTE_DB_PREFIX}${id}`).catch(() => undefined)),
  );
}

/**
 * 清理超过保留期没有打开过的本地库。
 *
 * @param now 当前时间，测试可注入
 */
export async function pruneStaleLocalNotes(now = Date.now()): Promise<number> {
  const index = readIndex();
  const stale = Object.entries(index).filter(
    ([, openedAt]) => typeof openedAt !== "number" || now - openedAt > LOCAL_NOTE_RETENTION_MS,
  );
  if (stale.length === 0) return 0;
  for (const [id] of stale) delete index[id];
  writeIndex(index);
  if (hasIndexedDb()) {
    await Promise.all(
      stale.map(([id]) => idb.deleteDB(`${LOCAL_NOTE_DB_PREFIX}${id}`).catch(() => undefined)),
    );
  }
  return stale.length;
}
