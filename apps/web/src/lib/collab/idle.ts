/** 标签页隐藏且闲置多久后主动断开协同连接。 */
export const COLLAB_IDLE_DISCONNECT_MS = 5 * 60 * 1000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "focus"] as const;

/**
 * 闲置断开：标签页隐藏且闲置满 `idleMs` 后调用 `disconnect()`；
 * 回到前台或有操作时，若是由这里断开的就调用 `connect()` 重连。
 *
 * 断开期间的编辑由本地副本保存，重连时随同步握手补齐。
 *
 * @returns 停止监听并清掉计时器的函数
 */
export function watchIdleDisconnect(
  target: { connect(): void; disconnect(): void },
  options: { idleMs?: number; doc?: Document; win?: Window } = {},
): () => void {
  const doc = options.doc ?? document;
  const win = options.win ?? window;
  const idleMs = options.idleMs ?? COLLAB_IDLE_DISCONNECT_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disconnectedByIdle = false;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const resume = () => {
    clear();
    if (disconnectedByIdle) {
      disconnectedByIdle = false;
      target.connect();
    }
  };

  const handleVisibility = () => {
    if (doc.visibilityState === "hidden") {
      clear();
      timer = setTimeout(() => {
        timer = null;
        disconnectedByIdle = true;
        target.disconnect();
      }, idleMs);
      return;
    }
    resume();
  };

  doc.addEventListener("visibilitychange", handleVisibility);
  for (const event of ACTIVITY_EVENTS) win.addEventListener(event, resume);
  if (doc.visibilityState === "hidden") handleVisibility();

  return () => {
    clear();
    doc.removeEventListener("visibilitychange", handleVisibility);
    for (const event of ACTIVITY_EVENTS) win.removeEventListener(event, resume);
  };
}
