import { afterEach, describe, expect, it } from "vitest";
import {
  LEAVE_CONFIRMATION_WINDOW_MS,
  clearLeaveConfirmed,
  leaveRecentlyConfirmed,
  markLeaveConfirmed,
} from "../leave-confirmation";

afterEach(() => {
  clearLeaveConfirmed();
});

describe("站内确认离开的短暂记录", () => {
  it("没有确认过时不算", () => {
    expect(leaveRecentlyConfirmed(1_000)).toBe(false);
  });

  it("确认后的窗口内算已确认，过了窗口就失效", () => {
    markLeaveConfirmed(10_000);
    expect(leaveRecentlyConfirmed(10_000 + LEAVE_CONFIRMATION_WINDOW_MS - 1)).toBe(true);
    expect(leaveRecentlyConfirmed(10_000 + LEAVE_CONFIRMATION_WINDOW_MS)).toBe(false);
  });

  it("清除后立即失效", () => {
    markLeaveConfirmed(10_000);
    clearLeaveConfirmed();
    expect(leaveRecentlyConfirmed(10_001)).toBe(false);
  });
});
