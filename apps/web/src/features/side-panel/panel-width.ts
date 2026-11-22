/**
 * 右侧栏宽度偏好的本地读写，只被懒加载宿主引用。
 *
 * @author 称霸幼儿园
 */

const WIDTH_KEY = "anynote-side-panel-width";

/**
 * 读取用户拖动后的侧栏宽度。
 *
 * @returns 有限的像素宽度，未设置或非法时为空
 */
export function readSidePanelWidth(): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * 写入侧栏宽度偏好；空值表示恢复默认。
 *
 * @param width 像素宽度或空值
 */
export function writeSidePanelWidth(width: number | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (width === null) localStorage.removeItem(WIDTH_KEY);
    else localStorage.setItem(WIDTH_KEY, String(width));
  } catch {
    // 配额或隐私模式：本次拖动仍生效，下次打开回到默认
  }
}
