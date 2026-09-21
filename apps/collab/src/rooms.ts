/**
 * 房间命名契约（前后端共用，改动即破坏既有房间的定位）：
 *
 * - `note:<noteId>` —— 知识库笔记的协同会话；noteId 是 `n_note` 主键，正整数。
 *
 * 目标态只有这一种房间：
 * - 旧的 `index`（协同文档库索引）与 `doc:<uuid>`（独立协作文档）随 `/docs` 退役**直接删除**，
 *   不设过渡期（方案 §8，Q1 已确认 `/docs` 只有测试数据）。
 *
 * 前端侧 `apps/web/src/lib/collab/rooms.ts` 是同一份契约的副本，两侧必须逐字一致；
 * `rooms.pair.test.ts` 用同一组输入对拍，任何一侧改规则都会红。
 */
export type CollabRoom = { kind: "note"; noteId: number };

/** noteId 的十进制上限：19 位足以覆盖 bigint 主键，超出即视为非法（防滥用与目录穿越）。 */
const MAX_NOTE_ID_LENGTH = 19;

/** noteId 无前导零的正整数：`01`、`0`、`-1`、`1.5` 一律拒绝。 */
const NOTE_ID_PATTERN = /^[1-9][0-9]{0,18}$/;

export function parseRoom(name: string): CollabRoom | null {
  if (!name.startsWith("note:")) return null;

  const raw = name.slice("note:".length);
  if (raw.length === 0 || raw.length > MAX_NOTE_ID_LENGTH) return null;
  if (!NOTE_ID_PATTERN.test(raw)) return null;

  const noteId = Number(raw);
  // Number 与正则都通过仍可能超出安全整数（如 20 位数字），此时按非法处理。
  if (!Number.isSafeInteger(noteId)) return null;

  return { kind: "note", noteId };
}

export function noteRoomName(noteId: number): string {
  return `note:${noteId}`;
}

/**
 * 从 WebSocket 握手 URL 里取房间名与令牌。
 *
 * 浏览器的 WebSocket 构造函数不能自定义请求头，令牌只能走查询串；
 * 因此签发端必须把有效期压到分钟级（见 BFF `/api/auth/collab-token`）。
 */
export function parseHandshake(
  url: string | undefined,
): { room: CollabRoom; token: string } | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url, "http://collab.invalid");
  } catch {
    return null;
  }

  const room = parseRoom(decodeURIComponent(parsed.pathname.replace(/^\/+/, "")));
  const token = parsed.searchParams.get("token");
  if (!room || !token) return null;

  return { room, token };
}

/** 结构化房间 → 规范房间名（`parseRoom` 的逆运算）。 */
export function roomName(room: CollabRoom): string {
  return noteRoomName(room.noteId);
}
