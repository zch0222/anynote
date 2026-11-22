/**
 * 侧栏标签与正文面板的 DOM id，供 aria-controls / aria-labelledby 使用。
 *
 * @author 称霸幼儿园
 */

export function tabDomId(surface: string, tabId: string): string {
  return `side-panel-tab-${sanitize(surface)}-${tabId}`;
}

export function tabPanelId(surface: string, tabId: string): string {
  return `side-panel-panel-${sanitize(surface)}-${tabId}`;
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
