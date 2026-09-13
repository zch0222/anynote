/**
 * CLI 浏览器授权登录的纯逻辑。
 *
 * 这里**不 import 任何 Next 运行时**：BFF route、页面组件与单测都直接调这些函数，
 * 校验规则只有一份。契约登记见 `.claude/openspec/changes/2026-09-13-cli-browser-login.md`。
 *
 * 设计要点：浏览器只经手**一次性授权码**，Token 由 CLI 拿 code + PKCE verifier
 * 直接向后端换取，因此这些函数产出的任何字符串都不得包含凭据。
 */

/** 授权码有效期。CLI 收到回调后应立即兑换，60 秒足够，越短攻击面越小。 */
export const CLI_CODE_TTL_MS = 60_000;

/** 回环端口的最小值。1024 以下是特权端口，内核不会分配给普通进程，直接拒掉更清楚。 */
const MIN_PORT = 1024;
const MAX_PORT = 65535;

/** state / PKCE challenge 的长度上限，防止超长串进内存与日志。 */
const MAX_OPAQUE_LENGTH = 128;

/**
 * base64url 字符集（RFC 4648 §5，无填充）。
 *
 * state 与 PKCE verifier/challenge 都是这个字符集，所以共用一条校验规则；
 * 不做长度下限以外的形状放宽，避免把奇怪字符带进 URL 与日志。
 */
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export type CliAuthorizeParams = {
  /** CLI 的回环监听端口 */
  port: number;
  /** CSRF / 串号防护串，原样回传 */
  state: string;
  /** PKCE S256 challenge（base64url） */
  challenge: string;
};

export type ParseResult = { ok: true; params: CliAuthorizeParams } | { ok: false; reason: string };

function readOpaque(value: string | null, label: string, result: { reason?: string }) {
  if (!value) {
    result.reason = `缺少 ${label}`;
    return null;
  }
  if (value.length > MAX_OPAQUE_LENGTH) {
    result.reason = `${label} 过长`;
    return null;
  }
  if (!BASE64URL.test(value)) {
    result.reason = `${label} 含非法字符`;
    return null;
  }
  return value;
}

/**
 * 校验并把 URL 查询串解析成授权参数。
 *
 * 只接受十进制写法（`parseInt` 会接受 `"80abc"`，所以用正则先卡形状）；
 * 端口必须是 1024–65535 的整数——回环服务由内核随机分配，不会落在特权段。
 */
export function parseCliAuthorizeParams(search: string | URLSearchParams): ParseResult {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const scratch: { reason?: string } = {};

  const rawPort = params.get("port");
  if (!rawPort || !/^\d{1,5}$/.test(rawPort)) {
    return { ok: false, reason: "port 必须是十进制端口号" };
  }
  const port = Number(rawPort);
  if (port < MIN_PORT || port > MAX_PORT) {
    return { ok: false, reason: `port 必须在 ${MIN_PORT}-${MAX_PORT} 之间` };
  }

  const state = readOpaque(params.get("state"), "state", scratch);
  if (!state) return { ok: false, reason: scratch.reason ?? "state 非法" };

  const challenge = readOpaque(params.get("challenge"), "challenge", scratch);
  if (!challenge) return { ok: false, reason: scratch.reason ?? "challenge 非法" };

  return { ok: true, params: { port, state, challenge } };
}

/**
 * 构造回环回调地址。
 *
 * 固定 `127.0.0.1` 而不是 `localhost`：CLI 只监听 IPv4 回环，而 `localhost`
 * 在双栈机器上可能先解析到 `::1`，那会连不上。
 */
export function buildLoopbackCallbackUrl(
  port: number,
  payload: { code: string; state: string },
): string {
  const url = new URL(`http://127.0.0.1:${port}/callback`);
  url.searchParams.set("code", payload.code);
  url.searchParams.set("state", payload.state);
  return url.toString();
}

/** 组装登录页的 `next` 参数：登录后要回到授权页，且带上全部原始参数。 */
export function buildLoginRedirect(params: CliAuthorizeParams): string {
  const query = new URLSearchParams({
    port: String(params.port),
    state: params.state,
    challenge: params.challenge,
  });
  return `/login?next=${encodeURIComponent(`/cli/authorize?${query.toString()}`)}`;
}
