import "server-only";
import { CLI_CODE_TTL_MS } from "./cli-authorize";

/**
 * CLI 授权码的一次性存储。
 *
 * 授权码只在本进程内存里活 60 秒，**不落盘、不进 Redis**：它只是"CLI 确实发起过一次
 * 授权、且用户点了同意"的短票据，进程重启即作废（CLI 会重新走一遍流程）。
 *
 * 与 `lib/auth/refresh.ts` 同一套路把 Map 挂在 globalThis 上：dev HMR 与分路由打包都会
 * 重新实例化模块，挂模块作用域会丢掉正在进行的授权，让用户点了授权却换不到 Token。
 *
 * ⚠️ **单实例假设**：签发与兑换必须在同一个 Node 进程。这与 `refreshWithLock` 的进程级
 * 单飞锁是同一约束，当前部署（单容器）成立；将来多实例部署要把这份状态挪进 Redis。
 */
export type CliCodeEntry = {
  /** 被授权用户的用户名，仅用于回显与审计 */
  username: string;
  /** PKCE S256 challenge（base64url），兑换时必须由 verifier 复算出同一个值 */
  challenge: string;
  /** 后端为 CLI 另发的令牌对；**只在服务端内存里**，从不进入浏览器 */
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const globalStore = globalThis as typeof globalThis & {
  __anynoteCliCodes?: Map<string, CliCodeEntry>;
};
if (!globalStore.__anynoteCliCodes) globalStore.__anynoteCliCodes = new Map();
const codes = globalStore.__anynoteCliCodes;

/** 生成一次性授权码：32 字节 CSPRNG，base64url（无填充，可安全进 URL）。 */
export function newCliCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export function issueCliCode(entry: Omit<CliCodeEntry, "expiresAt">): string {
  const code = newCliCode();
  codes.set(code, { ...entry, expiresAt: Date.now() + CLI_CODE_TTL_MS });
  return code;
}

/**
 * 取用并**立即删除**授权码。
 *
 * 三条硬规则，任一不满足都当作"没有这个码"：
 * 1. 取用即删——同一个码不可能被兑换两次（重放防护）；
 * 2. 过期即删——顺手清掉，避免 Map 无限增长；
 * 3. 不区分"不存在"与"已过期"，错误信息不泄露码是否曾经存在。
 */
export function consumeCliCode(code: string): CliCodeEntry | null {
  const entry = codes.get(code);
  if (!entry) return null;
  codes.delete(code);
  if (entry.expiresAt <= Date.now()) return null;
  return entry;
}

/** 仅供单测：清空存储，避免用例之间互相污染。 */
export function clearCliCodes(): void {
  codes.clear();
}
