/**
 * 右侧栏本地存储键与登出清理，保持首屏可引用且不依赖懒加载模块。
 *
 * @author 称霸幼儿园
 */

export const SIDE_PANEL_STORAGE_PREFIX = "anynote-ai-side-panel:";

/** 刷新前侧栏是否展开的标记；与资源标识同前缀，登出时一并删除。 */
export const SIDE_PANEL_OPEN_KEY = `${SIDE_PANEL_STORAGE_PREFIX}open`;

/** 当前标签数量；供移动端首屏显示「已打开的内容」。 */
export const SIDE_PANEL_TABS_KEY = `${SIDE_PANEL_STORAGE_PREFIX}tabs`;

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
 * 记录刷新前侧栏是否展开。
 *
 * @param open 当前是否展开
 */
export function setSidePanelOpenFlag(open: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (open) localStorage.setItem(SIDE_PANEL_OPEN_KEY, "1");
    else localStorage.removeItem(SIDE_PANEL_OPEN_KEY);
  } catch {
    // 隐私模式下写入失败不影响当前会话
  }
}

/**
 * 读取上次记录的标签数量。
 *
 * @returns 非负整数，缺失或损坏时为 0
 */
export function readSidePanelTabCount(): number {
  if (typeof localStorage === "undefined") return 0;
  try {
    const value = Number(localStorage.getItem(SIDE_PANEL_TABS_KEY));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/**
 * 记录当前标签数量。
 *
 * @param count 标签数量
 */
export function setSidePanelTabCount(count: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (count > 0) localStorage.setItem(SIDE_PANEL_TABS_KEY, String(count));
    else localStorage.removeItem(SIDE_PANEL_TABS_KEY);
  } catch {
    // 隐私模式下写入失败不影响当前会话
  }
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
