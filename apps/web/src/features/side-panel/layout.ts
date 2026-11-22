/**
 * 桌面右侧栏宽度规则（纯函数）。
 *
 * @author 称霸幼儿园
 */

export const LIST_WIDTH = 288;
export const CHAT_MIN_WIDTH = 440;
export const PANEL_MIN_WIDTH = 360;
export const PANEL_DEFAULT_MIN_WIDTH = 420;
export const PANEL_DEFAULT_MAX_WIDTH = 720;
export const PANEL_MAX_RATIO = 0.7;

export type SidePanelLayoutMode = "push" | "overlay";

export type SidePanelLayout = {
  mode: SidePanelLayoutMode;
  panelWidth: number;
  showList: boolean;
  canMaximize: boolean;
  minWidth: number;
  maxWidth: number;
};

/**
 * 首次打开侧栏的默认宽度：容器宽度的 40%，夹在 420–720。
 *
 * @param containerWidth ChatPage 容器实测宽度
 * @returns 默认宽度
 */
export function defaultPanelWidth(containerWidth: number): number {
  return clamp(Math.round(containerWidth * 0.4), PANEL_DEFAULT_MIN_WIDTH, PANEL_DEFAULT_MAX_WIDTH);
}

/**
 * 按容器宽度与用户偏好计算侧栏布局。
 *
 * @param input 容器宽度、持久化宽度与最大化状态
 * @returns 呈现方式、宽度、会话列表可见性与最大化按钮可见性
 */
export function computeLayout(input: {
  width: number;
  preferred: number | null;
  maximized: boolean;
}): SidePanelLayout {
  const width = Math.max(0, Number.isFinite(input.width) ? input.width : 0);
  if (input.maximized) {
    return {
      mode: "overlay",
      panelWidth: width,
      showList: true,
      canMaximize: true,
      minWidth: width,
      maxWidth: width,
    };
  }
  if (width >= LIST_WIDTH + CHAT_MIN_WIDTH + PANEL_MIN_WIDTH) {
    const maxWidth = Math.min(width * PANEL_MAX_RATIO, width - LIST_WIDTH - CHAT_MIN_WIDTH);
    return {
      mode: "push",
      panelWidth: clampPreferred(input.preferred, width, maxWidth),
      showList: true,
      canMaximize: true,
      minWidth: PANEL_MIN_WIDTH,
      maxWidth,
    };
  }
  if (width >= CHAT_MIN_WIDTH + PANEL_MIN_WIDTH) {
    const maxWidth = Math.min(width * PANEL_MAX_RATIO, width - CHAT_MIN_WIDTH);
    return {
      mode: "push",
      panelWidth: clampPreferred(input.preferred, width, maxWidth),
      showList: false,
      canMaximize: true,
      minWidth: PANEL_MIN_WIDTH,
      maxWidth,
    };
  }
  return {
    mode: "overlay",
    panelWidth: width,
    showList: true,
    canMaximize: false,
    minWidth: width,
    maxWidth: width,
  };
}

/**
 * 把拖动得到的宽度夹在侧栏最小宽度与当前规则上限之间。
 *
 * @param preferred 用户偏好宽度
 * @param containerWidth 容器宽度
 * @param maxWidth 当前规则上限
 * @returns 实际宽度
 */
export function clampPreferred(
  preferred: number | null,
  containerWidth: number,
  maxWidth: number,
): number {
  const base =
    typeof preferred === "number" && Number.isFinite(preferred) && preferred > 0
      ? preferred
      : defaultPanelWidth(containerWidth);
  return clamp(base, PANEL_MIN_WIDTH, Math.max(PANEL_MIN_WIDTH, maxWidth));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
