/**
 * 房间命名契约，必须与 `apps/collab/src/rooms.ts` 逐字一致：
 * 服务端按同样的规则解析房间名并映射到持久化文件，任何一侧改了都会连不上。
 */
export const COLLAB_INDEX_ROOM = "index";

/** 与服务端 `DOC_ID_PATTERN` 相同：URL 安全字符，8~64 位。 */
const DOC_ID_PATTERN = /^[0-9a-zA-Z_-]{8,64}$/;

export function isCollabDocId(value: string): boolean {
  return DOC_ID_PATTERN.test(value);
}

export function collabDocRoom(docId: string): string {
  return `doc:${docId}`;
}

/** 新文档 id。randomUUID 产出 36 位、只含十六进制与连字符，正好落在合法区间内。 */
export function createCollabDocId(): string {
  return crypto.randomUUID();
}
