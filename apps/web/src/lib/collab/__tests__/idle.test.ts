import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLAB_IDLE_DISCONNECT_MS, watchIdleDisconnect } from "../idle";

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

let target: {
  connect: ReturnType<typeof vi.fn<() => void>>;
  disconnect: ReturnType<typeof vi.fn<() => void>>;
};
let stop: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  target = { connect: vi.fn<() => void>(), disconnect: vi.fn<() => void>() };
  stop = watchIdleDisconnect(target);
});

afterEach(() => {
  stop();
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  vi.useRealTimers();
});

describe("watchIdleDisconnect", () => {
  it("隐藏且闲置满 5 分钟才断开", () => {
    setVisibility("hidden");
    vi.advanceTimersByTime(COLLAB_IDLE_DISCONNECT_MS - 1);
    expect(target.disconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(target.disconnect).toHaveBeenCalledOnce();
  });

  it("回到前台时自动重连", () => {
    setVisibility("hidden");
    vi.advanceTimersByTime(COLLAB_IDLE_DISCONNECT_MS);
    setVisibility("visible");
    expect(target.connect).toHaveBeenCalledOnce();
  });

  it("在闲置期满前回到前台不断开", () => {
    setVisibility("hidden");
    vi.advanceTimersByTime(60_000);
    setVisibility("visible");
    vi.advanceTimersByTime(COLLAB_IDLE_DISCONNECT_MS);
    expect(target.disconnect).not.toHaveBeenCalled();
    expect(target.connect).not.toHaveBeenCalled();
  });

  it("不是闲置断开导致的断线，回到前台时不插手重连", () => {
    setVisibility("hidden");
    setVisibility("visible");
    expect(target.connect).not.toHaveBeenCalled();
  });

  it("停止后不再断开", () => {
    stop();
    setVisibility("hidden");
    vi.advanceTimersByTime(COLLAB_IDLE_DISCONNECT_MS * 2);
    expect(target.disconnect).not.toHaveBeenCalled();
  });
});
