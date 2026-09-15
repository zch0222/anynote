import http from "node:http";
import type { AddressInfo } from "node:net";
import { AuthFlowError } from "../core/exit";

/**
 * 回环回调服务：浏览器授权完成后把一次性授权码投递到这里。
 *
 * 三条硬约束：
 * 1. **只绑 `127.0.0.1`**，不绑 `0.0.0.0`——授权码不能出现在局域网上；
 * 2. 端口交给内核分配（`:0`），避免固定端口被占用或被他人预判；
 * 3. 收到第一个**合法**（state 匹配）的回调就结束等待，后续请求一律 409。
 */

export type LoopbackResult = {
  code: string;
  state: string;
};

/**
 * 回环流程失败。继承 {@link AuthFlowError}，因此超时 / 取消 / 端口占用都会以
 * 退出码 3（未认证）结束——对 agent 的结论一致：让用户重跑 `anynote auth login`。
 */
export class LoopbackError extends AuthFlowError {
  constructor(message: string) {
    super(message);
    this.name = "LoopbackError";
  }
}

export type WaitOptions = { timeoutMs?: number; signal?: AbortSignal };

export type LoopbackServer = {
  port: number;
  /**
   * 等待浏览器回调。
   *
   * 可重入语义：等待已结束后再调用会**立即 reject**（携带结束原因），而不是永远挂着——
   * 否则调用方在超时后重试会静默卡死。
   */
  waitForCode: (options?: WaitOptions) => Promise<LoopbackResult>;
  close: () => Promise<void>;
};

/** 回调路径。与 BFF 的 `buildLoopbackCallbackUrl` 必须一致。 */
export const CALLBACK_PATH = "/callback";

export type LoopbackOptions = {
  /** 期望的 state；不匹配的回调直接拒绝，不当作成功。 */
  state: string;
  /** 测试用：允许指定端口，默认 0（内核分配）。 */
  port?: number;
  /** 被忽略请求的观察口，供单测断言与排障。 */
  onIgnoredRequest?: (info: { url: string; reason: string }) => void;
};

/**
 * 回调页面（D-15 图例 13）。
 *
 * 与 `apps/web` 的认证卡片同一视觉：分组底 + 居中白卡 + 品牌标记。
 * 这里**不能 import 前端的任何东西**——CLI 是独立包，跑在 Node 而没有 Next/Tailwind，
 * 所以版式落成一段内联 CSS，色值抄 `apps/web/src/app/globals.css` 的语义 Token
 * （深色用 `prefers-color-scheme` 兜底：这个页面不知道应用里的主题偏好）。
 *
 * 六个页面的文案各有不同，视觉只有这一处——改版式只改这里。
 */
function html(message: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Anynote CLI</title>
<style>
  :root{--grouped:#f2f2f7;--surface:#fff;--separator:#e5e5ea;--label:#1d1d1f;
    --label-secondary:#6e6e73;--accent:#0071e3;--shadow:0 1px 2px rgb(0 0 0 / .04),0 4px 16px rgb(0 0 0 / .06)}
  @media (prefers-color-scheme:dark){:root{--grouped:#000;--surface:#1c1c1e;--separator:#3a3a3c;
    --label:#f5f5f7;--label-secondary:#98989d;--accent:#0a84ff}}
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
    margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;
    background:var(--grouped);color:var(--label);padding:1rem}
  main{width:100%;max-width:400px;padding:1.75rem;background:var(--surface);
    border:1px solid var(--separator);border-radius:20px;box-shadow:var(--shadow)}
  .brand{display:flex;align-items:center;gap:.5rem;margin-bottom:1.5rem}
  .mark{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:var(--accent)}
  .wordmark{font-size:1.0625rem;font-weight:600;letter-spacing:-.01em}
  h1{font-size:1.375rem;font-weight:600;letter-spacing:-.01em;line-height:1.3;margin:0}
  p{margin:0;font-size:.8125rem;line-height:1.5;color:var(--label-secondary)}
</style>
</head><body><main>
<div class="brand">
  <span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none"
    stroke="#fff" stroke-width="0.82" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 6.7 L6.4 4.6 L6.4 17 L12 18.7"/><path d="M12 6.7 L17.6 4.6 L17.6 17 L12 18.7"/>
    <path d="M12 6.7 L12 18.7"/></svg></span>
  <span class="wordmark">Anynote CLI</span>
</div>
<h1>${message}</h1>
</main></body></html>`;
}

export function startLoopbackServer(options: LoopbackOptions): Promise<LoopbackServer> {
  return new Promise((resolve, reject) => {
    /**
     * 服务终态。只有两种：从未结束（null）或已经结束（携带原因）。
     *
     * 用"显式终态"而不是散落的布尔量，是因为等待与回调是并发的两方：
     * 谁先结束、另一方之后再来，都必须拿到同一个确定结果。早先的实现用
     * `done` 布尔量配一个可变 `settle`，导致"超时后再等一次"永远挂起。
     */
    let outcome: { ok: true; value: LoopbackResult } | { ok: false; error: Error } | null = null;
    /** 当前等待方的唤醒钩子；同一时刻至多一个。 */
    let notify: (() => void) | null = null;

    function finish(result: { ok: true; value: LoopbackResult } | { ok: false; error: Error }) {
      if (outcome) return;
      outcome = result;
      notify?.();
    }

    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method !== "GET" || url.pathname !== CALLBACK_PATH) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not Found");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (outcome?.ok) {
        response.writeHead(409, { "content-type": "text/html; charset=utf-8" });
        response.end(html("本次授权已经完成，可以关闭此页面。"));
        return;
      }

      if (!code || !state) {
        options.onIgnoredRequest?.({ url: url.toString(), reason: "缺少 code 或 state" });
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        response.end(html("回调参数不完整，请回到终端重新执行 anynote auth login。"));
        return;
      }

      // state 不匹配：可能来自另一个 CLI 进程，或有人手工构造的链接。
      // 拒绝但**不结束等待**——真正的回调还在后面。
      if (state !== options.state) {
        options.onIgnoredRequest?.({ url: url.toString(), reason: "state 不匹配" });
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        response.end(html("state 校验失败，请回到终端重新执行 anynote auth login。"));
        return;
      }

      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(html("已收到授权，请回到终端继续。此页面可以关闭。"));
      finish({ ok: true, value: { code, state } });
    });

    server.on("error", (error) => {
      const wrapped =
        error instanceof Error && "code" in error && error.code === "EADDRINUSE"
          ? new LoopbackError("回环端口被占用，请重试或改用 --password-stdin")
          : error;
      // 监听失败时 Promise 还没 resolve，直接 reject；已 resolve 则记为终态。
      if (outcome === null && !server.listening) {
        reject(wrapped);
        return;
      }
      finish({ ok: false, error: wrapped instanceof Error ? wrapped : new Error(String(wrapped)) });
    });

    server.listen(options.port ?? 0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo | null;
      if (!address || typeof address === "string") {
        reject(new LoopbackError("无法确定回环监听端口"));
        return;
      }

      resolve({
        port: address.port,
        waitForCode: ({ timeoutMs = 300_000, signal }: WaitOptions = {}) =>
          new Promise<LoopbackResult>((resolveWait, rejectWait) => {
            // 已经结束过：立刻给出同一个结论，不挂起。
            if (outcome) {
              if (outcome.ok) resolveWait(outcome.value);
              else rejectWait(outcome.error);
              return;
            }
            if (signal?.aborted) {
              rejectWait(new LoopbackError("授权已取消"));
              return;
            }

            const timer = setTimeout(
              () => finish({ ok: false, error: new LoopbackError(timeoutMessage(timeoutMs)) }),
              timeoutMs,
            );
            // 定时器不该拖着进程不让退出。
            timer.unref?.();

            const onAbort = () => finish({ ok: false, error: new LoopbackError("授权已取消") });
            signal?.addEventListener("abort", onAbort, { once: true });

            notify = () => {
              clearTimeout(timer);
              signal?.removeEventListener("abort", onAbort);
              notify = null;
              if (!outcome) return;
              if (outcome.ok) resolveWait(outcome.value);
              else rejectWait(outcome.error);
            };

            // finish 可能在本函数的同步段之前就已经发生（回调比 waitForCode 更早到达），
            // 那种情况下 outcome 非空，上面已经处理；这里补一次，覆盖"注册 notify 前刚结束"。
            if (outcome) notify();
          }),
        close: () =>
          new Promise<void>((resolveClose) => {
            // 关之前先给还在等的调用方一个明确结论，避免它挂到超时。
            finish({ ok: false, error: new LoopbackError("回环服务已关闭") });
            server.close(() => resolveClose());
            server.closeAllConnections?.();
          }),
      });
    });
  });
}

function timeoutMessage(timeoutMs: number): string {
  return `等待授权超时（${Math.round(timeoutMs / 1000)} 秒）`;
}
