/**
 * 房间命名契约，必须与 `apps/collab/src/rooms.ts` 逐字一致：
 * 服务端按同样的规则解析房间名并据此绑定令牌，任何一侧改了都会连不上。
 *
 * `__tests__/rooms.test.ts` 有一条**对拍测试**：直接读服务端源文件，比对前缀、
 * noteId 正则与长度上限三处字面量。改了一侧忘了另一侧，那条用例会红。
 *
 * 目标态只有一种房间：`note:<noteId>`（noteId 是 `n_note` 主键，正整数）。
 * 旧的 `index` 与 `doc:<uuid>` 随 `/docs` 退役一并删除（方案 §8）。
 */

/** 房间名前缀。 */
export const COLLAB_ROOM_PREFIX = "note:";

/** noteId 的十进制上限：19 位足以覆盖 bigint 主键，超出即视为非法。 */
export const COLLAB_NOTE_ID_MAX_LENGTH = 19;

/** noteId 无前导零的正整数：`01`、`0`、`-1`、`1.5` 一律拒绝。 */
export const COLLAB_NOTE_ID_PATTERN = /^[1-9][0-9]{0,18}$/;

export type CollabRoom = { kind: "note"; noteId: number };

/** 解析房间名；非法返回 null。与服务端 `parseRoom` 同一套规则。 */
export function parseCollabRoom(name: string): CollabRoom | null {
  if (!name.startsWith(COLLAB_ROOM_PREFIX)) return null;

  const raw = name.slice(COLLAB_ROOM_PREFIX.length);
  if (raw.length === 0 || raw.length > COLLAB_NOTE_ID_MAX_LENGTH) return null;
  if (!COLLAB_NOTE_ID_PATTERN.test(raw)) return null;

  const noteId = Number(raw);
  if (!Number.isSafeInteger(noteId)) return null;

  return { kind: "note", noteId };
}

/** 结构化房间 → 规范房间名（`parseCollabRoom` 的逆运算）。 */
export function collabNoteRoom(noteId: number): string {
  return `${COLLAB_ROOM_PREFIX}${noteId}`;
}

/** 是否是合法的 note 房间名。路由 / 持久化前的守卫用它。 */
export function isCollabNoteRoom(name: string): boolean {
  return parseCollabRoom(name) !== null;
}
