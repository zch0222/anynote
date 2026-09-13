import { createHash, randomBytes } from "node:crypto";

/**
 * PKCE（RFC 7636）S256 参数生成。
 *
 * 为什么 CLI 需要它：浏览器授权页只把**一次性授权码**交给 CLI，而那个回调会打到
 * `127.0.0.1:<随机端口>`。同机器上的其他进程可以先抢占端口、或监听同一个端口，
 * 从而截获 code。PKCE 让 code 单独没用——兑换时还必须出示 `codeVerifier`，
 * 而它只在 CLI 进程内存里，从不进浏览器。
 */

/** base64url（无填充），满足 RFC 7636 对 verifier/challenge 的字符集要求。 */
function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

/** 43–128 字符的 verifier；32 字节熵编码后是 43 字符。 */
export const CODE_VERIFIER_BYTES = 32;

/** state：防跨进程串号，也是 32 字节。 */
export const STATE_BYTES = 32;

export function createCodeVerifier(): string {
  return base64url(randomBytes(CODE_VERIFIER_BYTES));
}

/** `BASE64URL(SHA256(ASCII(code_verifier)))`——BFF 侧用同一算法复算比对。 */
export function createCodeChallenge(codeVerifier: string): string {
  return base64url(createHash("sha256").update(codeVerifier, "ascii").digest());
}

/**
 * 生成一条授权请求的全部随机参数。
 *
 * 三个值一次生成、一起用：分开生成容易漏掉某个而让防护形同虚设，
 * 打包返回也方便单测对着同一份快照断言。
 */
export function createAuthorizationSecrets(): {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  const state = base64url(randomBytes(STATE_BYTES));
  const codeVerifier = createCodeVerifier();
  return { state, codeVerifier, codeChallenge: createCodeChallenge(codeVerifier) };
}

/**
 * 构造授权页地址。
 *
 * 用 `URL` 而不是字符串拼接：`webUrl` 可能自带路径前缀（反代到子路径的部署），
 * `new URL("/cli/authorize", base)` 会正确丢掉前缀——这里改为保留 base 的 path，
 * 只追加固定后缀，避免子路径部署下 404。
 */
export function buildAuthorizeUrl(
  webUrl: string,
  secrets: { state: string; codeChallenge: string },
  port: number,
): string {
  const base = webUrl.endsWith("/") ? webUrl : `${webUrl}/`;
  const url = new URL("cli/authorize", base);
  url.searchParams.set("port", String(port));
  url.searchParams.set("state", secrets.state);
  url.searchParams.set("challenge", secrets.codeChallenge);
  return url.toString();
}
