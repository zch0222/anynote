import "server-only";
import { z } from "zod";
import { parseCliAuthorizeParams } from "./cli-authorize";

/**
 * CLI 授权登录的参数校验。
 *
 * 与 `features/auth/schemas.ts` 的分工：那边是浏览器表单的输入校验（给人看的提示语），
 * 这边是 **BFF 收请求时的边界校验**（不可信输入，失败只回通用错误码）。
 */

const base64url = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "必须是 base64url");

/** 浏览器点「授权」时提交的参数。 */
export const cliTokenRequestSchema = z.object({
  port: z.number().int().min(1024).max(65535),
  state: base64url,
  codeChallenge: base64url,
});

export type CliTokenRequest = z.infer<typeof cliTokenRequestSchema>;

/**
 * CLI 兑换令牌时提交的参数。
 *
 * `code` 是 BFF 自己签发的 32 字节 base64url；`codeVerifier` 是 CLI 私藏的 PKCE
 * verifier（RFC 7636 允许 43–128 位 base64url）。
 */
export const cliExchangeRequestSchema = z.object({
  code: base64url,
  codeVerifier: z
    .string()
    .min(43)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/, "必须是 base64url"),
});

export type CliExchangeRequest = z.infer<typeof cliExchangeRequestSchema>;

/** 授权页 query 的校验直接复用纯函数，避免两份规则漂移。 */
export function parseAuthorizeQuery(search: string) {
  return parseCliAuthorizeParams(search);
}
