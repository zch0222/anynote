import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseRoom } from "./rooms.ts";

/**
 * 房间状态的落盘接口。整份 `Y.encodeStateAsUpdate` 覆盖写，不做增量日志——
 * 这是开发/自托管级别的持久化，文档规模上来后应换成真正的增量存储。
 */
export type CollabPersistence = {
  read(room: string): Promise<Uint8Array | null>;
  write(room: string, state: Uint8Array): Promise<void>;
};

/** 不落盘：进程退出即丢。未配置持久化目录时用它。 */
export const memoryOnlyPersistence: CollabPersistence = {
  read: async () => null,
  write: async () => {},
};

/**
 * 房间名 → 文件名。只接受 `parseRoom` 认可的房间名，
 * 因此文件名里不可能出现 `/`、`\` 或 `..`，杜绝目录穿越。
 */
export function roomFileName(room: string): string {
  const parsed = parseRoom(room);
  if (!parsed) throw new Error(`非法房间名：${room}`);
  return `note-${parsed.noteId}.ydoc`;
}

export function createFilePersistence(dir: string): CollabPersistence {
  let ready: Promise<void> | null = null;
  const ensureDir = () => {
    ready ??= mkdir(dir, { recursive: true }).then(() => {});
    return ready;
  };

  return {
    async read(room) {
      await ensureDir();
      try {
        const buffer = await readFile(join(dir, roomFileName(room)));
        return new Uint8Array(buffer);
      } catch (error) {
        // 首次打开房间时文件当然不存在，这是正常路径而非故障。
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },

    async write(room, state) {
      await ensureDir();
      const target = join(dir, roomFileName(room));
      // 先写临时文件再 rename：崩在写一半时不会留下半截状态把房间读坏。
      const temp = `${target}.${process.pid}.tmp`;
      await writeFile(temp, state);
      await rename(temp, target);
    },
  };
}

/** 应急落盘记录：房间的全量 Y 状态与它所属的谱系。 */
export type SpoolRecord = { epoch: string; state: Uint8Array };

/**
 * 应急落盘：note 服务不可用时，进程退出前把房间状态写到本地磁盘，下次开房时恢复并补写。
 */
export type RoomSpool = {
  read(room: string): Promise<SpoolRecord | null>;
  write(room: string, record: SpoolRecord): Promise<void>;
  remove(room: string): Promise<void>;
  /** 谱系对不上的记录改名留档，不再参与恢复，供人工处理。 */
  quarantine(room: string): Promise<void>;
};

/** 不落盘的应急实现：未配置持久化目录时使用。 */
export const disabledSpool: RoomSpool = {
  read: async () => null,
  write: async () => {
    throw new Error("未配置 COLLAB_PERSISTENCE_DIR，无法应急落盘");
  },
  remove: async () => {},
  quarantine: async () => {},
};

/** 房间名 → 应急落盘文件名，沿用 {@link roomFileName} 的目录穿越防护。 */
export function spoolFileName(room: string): string {
  return roomFileName(room).replace(/\.ydoc$/, ".spool.json");
}

/**
 * 基于目录的应急落盘：`<dir>/note-<id>.spool.json`，内容为 `{ epoch, state(Base64) }`。
 * 先写临时文件再改名，进程在写一半时崩溃也不会留下半截记录。
 */
export function createFileSpool(dir: string): RoomSpool {
  let ready: Promise<void> | null = null;
  const ensureDir = () => {
    ready ??= mkdir(dir, { recursive: true }).then(() => {});
    return ready;
  };

  return {
    async read(room) {
      await ensureDir();
      let raw: string;
      try {
        raw = await readFile(join(dir, spoolFileName(room)), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      const parsed = JSON.parse(raw) as { epoch?: unknown; state?: unknown };
      if (typeof parsed.epoch !== "string" || typeof parsed.state !== "string") return null;
      return { epoch: parsed.epoch, state: new Uint8Array(Buffer.from(parsed.state, "base64")) };
    },

    async write(room, record) {
      await ensureDir();
      const target = join(dir, spoolFileName(room));
      const temp = `${target}.${process.pid}.tmp`;
      const body = JSON.stringify({
        epoch: record.epoch,
        state: Buffer.from(record.state).toString("base64"),
      });
      await writeFile(temp, body);
      await rename(temp, target);
    },

    async remove(room) {
      await rm(join(dir, spoolFileName(room)), { force: true });
    },

    async quarantine(room) {
      const target = join(dir, spoolFileName(room));
      try {
        await rename(target, `${target}.orphan-${Date.now()}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}
