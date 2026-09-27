/**
 * 站内离开确认的短暂记录。
 *
 * 用户在站内确认框里选了离开之后，这次跳转可能退化成整页加载（例如离线时拿不到下一页的数据），
 * 此时浏览器还会再弹一次自带的离开确认。记录这次确认，紧随其后的整页卸载就不再拦截。
 */

/** 确认之后多久内的整页卸载视为同一次离开。 */
export const LEAVE_CONFIRMATION_WINDOW_MS = 5_000;

let confirmedAt: number | null = null;

/** 记录用户刚在站内确认了离开。 */
export function markLeaveConfirmed(now: number = Date.now()): void {
  confirmedAt = now;
}

/** 用户是否刚在站内确认过离开。 */
export function leaveRecentlyConfirmed(now: number = Date.now()): boolean {
  return confirmedAt !== null && now - confirmedAt < LEAVE_CONFIRMATION_WINDOW_MS;
}

/** 清除记录（编辑页卸载时调用，下一次打开重新计）。 */
export function clearLeaveConfirmed(): void {
  confirmedAt = null;
}
