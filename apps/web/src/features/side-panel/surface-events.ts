/**
 * 侧栏与外部动作之间的桥：会话删除、会话 key 迁移与站内离开检查在侧栏宿主之外发生。
 *
 * @author 称霸幼儿园
 */

type SurfaceHandlers = {
  remove: (surfaceKey: string) => void;
  rename: (from: string, to: string) => void;
  requestLeave: (surfaceKey: string) => boolean;
};

let handlers: SurfaceHandlers | null = null;

/** 由侧栏状态模块加载时登记分区移除、迁移与离开检查处理器。 */
export function registerSurfaceHandlers(next: SurfaceHandlers): void {
  handlers = next;
}

/**
 * 会话被删除后移除对应分区。
 *
 * @param conversationId 会话 id
 */
export function notifyConversationRemoved(conversationId: number): void {
  handlers?.remove(`chat:c${conversationId}`);
}

/**
 * 移除指定分区。
 *
 * @param surfaceKey 分区键
 */
export function removeSidePanelSurface(surfaceKey: string): void {
  handlers?.remove(surfaceKey);
}

/**
 * 新会话拿到 id 时迁移分区，须与对话流 store 的 `renameKey` 在同一个 `flushSync` 内调用。
 *
 * @param from 原分区键
 * @param to 新分区键
 */
export function renameSidePanelSurface(from: string, to: string): void {
  handlers?.rename(from, to);
}

/**
 * 在会让侧栏正文卸载的站内导航前，先走该分区活动正文的离开守卫。
 *
 * @param surfaceKey 分区键
 * @returns 是否允许离开；侧栏状态模块未加载（无正文挂载）时为 true
 */
export function requestSidePanelLeave(surfaceKey: string): boolean {
  return handlers?.requestLeave(surfaceKey) ?? true;
}
