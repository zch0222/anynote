import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
  return parsed.kind === "index" ? "index.ydoc" : `doc-${parsed.docId}.ydoc`;
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
