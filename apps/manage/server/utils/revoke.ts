/**
 * 令牌注销：调用认证服务 /auth/logout 撤销一对令牌。
 * 注销失败时静默，不改变调用方已经得出的结论。
 *
 * @author 称霸幼儿园
 */
import type { BackendClients } from './backend'
import type { TokenPair } from './cookies'

export type RevokeFn = (token: TokenPair) => Promise<void>

/**
 * 生产默认注销实现：POST /api/auth/logout。
 * @param clients 后端客户端
 * @return 注销函数
 */
export function createRevokeFn(clients: BackendClients): RevokeFn {
  return async (token) => {
    try {
      await clients.authClient.POST('/logout', {
        body: { accessToken: token.accessToken, refreshToken: token.refreshToken },
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      // 注销失败不掩盖调用方的既定结果
    }
  }
}

/**
 * 撤销令牌对，注销失败不影响调用方的结论。
 * @param revokeFn 注销函数，未提供时不做任何事
 * @param token 待撤销的令牌对，为空时不做任何事
 */
export async function revokeTokens(revokeFn: RevokeFn | undefined, token: TokenPair | undefined): Promise<void> {
  if (!revokeFn || !token) return
  try {
    await revokeFn(token)
  } catch {
    // 注销失败不掩盖调用方的既定结果
  }
}
