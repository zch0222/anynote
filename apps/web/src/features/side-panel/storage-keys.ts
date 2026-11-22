/**
 * 右侧栏本地存储键与登出清理，保持首屏可引用且不依赖懒加载模块。
 *
 * @author 称霸幼儿园
 */

export const SIDE_PANEL_STORAGE_PREFIX = "anynote-ai-side-panel:";

/**
 * 某个用户的侧栏存储键。
 *
 * @param userId 用户 id
 * @returns localStorage 键
 */
export function sidePanelStorageKey(userId: number): string {
  return `${SIDE_PANEL_STORAGE_PREFIX}v1:${userId}`;
}

/**
 * 删除全部侧栏存储键，与登出时的本地笔记清理一起执行。
 */
export function clearSidePanelStorage(): void {
  if (typeof localStorage === "undefined") return;
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(SIDE_PANEL_STORAGE_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch {
      // 隐私模式下删除失败不影响登出
    }
  }
}
