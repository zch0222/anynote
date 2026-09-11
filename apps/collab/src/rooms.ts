/**
 * 房间命名契约（前后端共用，改动即破坏既有文档的定位）：
 *
 * - `index`        —— 协同文档库索引，记录有哪些文档
 * - `doc:<docId>`  —— 单篇协同文档的正文
 *
 * docId 由前端生成（crypto.randomUUID），这里只校验形状，不查库。
 */
export type CollabRoom = { kind: "index" } | { kind: "doc"; docId: string };

export const INDEX_ROOM = "index";

/** 只放行 URL 安全字符，避免房间名被用来穿越持久化目录。 */
const DOC_ID_PATTERN = /^[0-9a-zA-Z_-]{8,64}$/;

export function parseRoom(name: string): CollabRoom | null {
  if (name === INDEX_ROOM) return { kind: "index" };

  const docId = name.startsWith("doc:") ? name.slice("doc:".length) : null;
  if (docId !== null && DOC_ID_PATTERN.test(docId)) return { kind: "doc", docId };

  return null;
}

export function docRoomName(docId: string): string {
  return `doc:${docId}`;
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
  return room.kind === "index" ? INDEX_ROOM : docRoomName(room.docId);
}
