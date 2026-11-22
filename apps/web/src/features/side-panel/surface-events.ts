/**
 * 侧栏与外部动作之间的桥：会话删除、会话 key 迁移在侧栏宿主之外发生。
 *
 * @author 称霸幼儿园
 */

type SurfaceHandler = (surfaceKey: string) => void;
type RenameHandler = (from: string, to: string) => void;

let removeHandler: SurfaceHandler | null = null;
let renameHandler: RenameHandler | null = null;

/** 由懒加载宿主登记分区移除与迁移处理器。 */
export function registerSurfaceHandlers(handlers: {
  remove: SurfaceHandler;
  rename: RenameHandler;
}): () => void {
  removeHandler = handlers.remove;
  renameHandler = handlers.rename;
  return () => {
    removeHandler = null;
    renameHandler = null;
  };
}

/**
 * 会话被删除后移除对应分区。
 *
 * @param conversationId 会话 id
 */
export function notifyConversationRemoved(conversationId: number): void {
  removeHandler?.(`chat:c${conversationId}`);
}

/**
 * 移除指定分区。
 *
 * @param surfaceKey 分区键
 */
export function removeSidePanelSurface(surfaceKey: string): void {
  removeHandler?.(surfaceKey);
}

/**
 * 新会话拿到 id 时迁移分区，须与对话流 store 的 `renameKey` 在同一个 `flushSync` 内调用。
 *
 * @param from 原分区键
 * @param to 新分区键
 */
export function renameSidePanelSurface(from: string, to: string): void {
  renameHandler?.(from, to);
}
