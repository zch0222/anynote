import { SIDE_PANEL_STORAGE_PREFIX } from "./storage-keys";

/**
 * 不依赖侧栏宿主挂载的持久化分区清理。
 *
 * @author 称霸幼儿园
 */

/**
 * 从所有用户的侧栏持久化状态里删除某个会话分区。
 *
 * 会话 id 全局唯一，删除后任何用户都不应再恢复该标签。
 *
 * @param conversationId 会话 id
 */
export function removePersistedConversationSurface(conversationId: number): void {
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0) return;
  if (typeof localStorage === "undefined") return;
  const surfaceKey = `chat:c${conversationId}`;
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(SIDE_PANEL_STORAGE_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    let raw: string | null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      continue;
    }
    if (!raw) continue;
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!payload || typeof payload !== "object") continue;
    const stored = payload as { version?: unknown; surfaces?: unknown };
    if (stored.version !== 1 || !stored.surfaces || typeof stored.surfaces !== "object") continue;
    const surfaces = stored.surfaces as Record<string, unknown>;
    if (!(surfaceKey in surfaces)) continue;
    delete surfaces[surfaceKey];
    try {
      if (Object.keys(surfaces).length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // 隐私模式或配额：本地清理失败不影响删除请求
    }
  }
}
