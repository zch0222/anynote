/** 本地改动多久没被服务端确认才报告为「同步中」。 */
export const UNACKED_GRACE_MS = 2_000;

export type SyncSnapshot = {
  /** 有本地改动超过宽限期仍未被服务端确认。 */
  unsynced: boolean;
  /** 已发出、尚未收到确认的本地改动数。 */
  pending: number;
  /** 断线期间有过本地编辑（重连并完成同步握手前一直为 true）。 */
  editedWhileOffline: boolean;
};

/**
 * 本地改动的确认计数：服务端对每条写方向同步消息回一条确认，本地改动发出时加一、确认到达时减一。
 *
 * 连接正常时确认在几毫秒内到达，只有超过 {@link UNACKED_GRACE_MS} 仍有未确认改动才报告为 `unsynced`，
 * 避免徽标随每次按键闪烁。重连并完成同步握手后清零：握手已把全部本地改动交给了服务端。
 */
export class SyncTracker {
  private pending = 0;
  private unsynced = false;
  private editedWhileOffline = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly graceMs: number;
  private readonly onChange: (snapshot: SyncSnapshot) => void;

  constructor(options: { onChange: (snapshot: SyncSnapshot) => void; graceMs?: number }) {
    this.onChange = options.onChange;
    this.graceMs = options.graceMs ?? UNACKED_GRACE_MS;
  }

  get snapshot(): SyncSnapshot {
    return {
      unsynced: this.unsynced,
      pending: this.pending,
      editedWhileOffline: this.editedWhileOffline,
    };
  }

  /**
   * 记录一次本地编辑。
   *
   * @param connected 编辑发生时连接是否正常；断线期间只记「有过编辑」
   */
  localEdit(connected: boolean): void {
    if (!connected) {
      if (!this.editedWhileOffline) {
        this.editedWhileOffline = true;
        this.emit();
      }
      return;
    }
    this.pending += 1;
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.pending > 0 && !this.unsynced) {
          this.unsynced = true;
          this.emit();
        }
      }, this.graceMs);
    }
  }

  /** 收到服务端确认。 */
  ack(): void {
    if (this.pending === 0) return;
    this.pending -= 1;
    if (this.pending === 0) this.settle();
  }

  /** 重连并完成同步握手：清零计数与断线编辑标记。 */
  resync(): void {
    this.pending = 0;
    const changed = this.editedWhileOffline;
    this.editedWhileOffline = false;
    this.settle(changed);
  }

  /** 连接断开：已发出但未确认的改动会在重连握手时补齐，计数改记为断线编辑。 */
  disconnect(): void {
    if (this.pending > 0) this.editedWhileOffline = true;
    this.pending = 0;
    this.clearTimer();
    this.unsynced = false;
    this.emit();
  }

  destroy(): void {
    this.clearTimer();
  }

  private settle(forceEmit = false): void {
    this.clearTimer();
    if (this.unsynced || forceEmit) {
      this.unsynced = false;
      this.emit();
    }
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private emit(): void {
    this.onChange(this.snapshot);
  }
}
