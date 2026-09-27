import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SyncSnapshot, SyncTracker, UNACKED_GRACE_MS } from "../sync-state";

let snapshots: SyncSnapshot[];
let tracker: SyncTracker;

beforeEach(() => {
  vi.useFakeTimers();
  snapshots = [];
  tracker = new SyncTracker({ onChange: (snapshot) => snapshots.push(snapshot) });
});

afterEach(() => {
  tracker.destroy();
  vi.useRealTimers();
});

describe("SyncTracker", () => {
  it("本地编辑加一、确认减一，宽限期内确认就不报告同步中", () => {
    tracker.localEdit(true);
    expect(tracker.snapshot.pending).toBe(1);
    tracker.ack();
    vi.advanceTimersByTime(UNACKED_GRACE_MS * 2);

    expect(tracker.snapshot).toEqual({ unsynced: false, pending: 0, editedWhileOffline: false });
    expect(snapshots).toEqual([]);
  });

  it("超过 2 秒仍未确认才报告同步中，确认到齐后恢复", () => {
    tracker.localEdit(true);
    tracker.localEdit(true);
    vi.advanceTimersByTime(UNACKED_GRACE_MS - 1);
    expect(tracker.snapshot.unsynced).toBe(false);
    vi.advanceTimersByTime(1);
    expect(tracker.snapshot.unsynced).toBe(true);

    tracker.ack();
    expect(tracker.snapshot.unsynced).toBe(true);
    tracker.ack();
    expect(tracker.snapshot.unsynced).toBe(false);
    expect(snapshots.map((snapshot) => snapshot.unsynced)).toEqual([true, false]);
  });

  it("多余的确认（例如对同步握手的确认）不会把计数减成负数", () => {
    tracker.ack();
    tracker.localEdit(true);
    expect(tracker.snapshot.pending).toBe(1);
  });

  it("断线期间的编辑只记「有过编辑」，不计入待确认", () => {
    tracker.localEdit(false);
    tracker.localEdit(false);
    vi.advanceTimersByTime(UNACKED_GRACE_MS * 2);

    expect(tracker.snapshot).toEqual({ unsynced: false, pending: 0, editedWhileOffline: true });
    expect(snapshots).toHaveLength(1);
  });

  it("断线时未确认的改动转记为断线编辑；重连同步后全部清零", () => {
    tracker.localEdit(true);
    tracker.disconnect();
    expect(tracker.snapshot).toEqual({ unsynced: false, pending: 0, editedWhileOffline: true });

    tracker.resync();
    expect(tracker.snapshot).toEqual({ unsynced: false, pending: 0, editedWhileOffline: false });
  });

  it("重连同步时清除宽限计时，不会迟到地报告同步中", () => {
    tracker.localEdit(true);
    tracker.resync();
    vi.advanceTimersByTime(UNACKED_GRACE_MS * 2);
    expect(tracker.snapshot.unsynced).toBe(false);
  });
});
