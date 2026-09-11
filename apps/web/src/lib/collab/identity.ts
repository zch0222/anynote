/**
 * 协同身份的共享常量与派生规则。
 *
 * 签发方与受众必须与 `apps/collab/src/auth.ts` 保持一致——两边不匹配时
 * 所有握手都会被拒，且错误只出现在协同服务日志里，很难从前端看出来。
 */
export const COLLAB_TOKEN_ISSUER = "anynote-web";
export const COLLAB_TOKEN_AUDIENCE = "anynote-collab";

/** 令牌有效期（秒）。浏览器 WebSocket 不能自定义请求头，令牌只能走查询串，因此必须短。 */
export const COLLAB_TOKEN_TTL_SECONDS = 300;

/**
 * 光标配色。取自 Tailwind 500 档，保证在亮色与暗色主题下都够显眼。
 * 顺序即分配顺序，改动会让老用户的光标换色（无功能影响）。
 */
export const COLLAB_USER_COLORS = [
  "#2563eb",
  "#16a34a",
  "#db2777",
  "#ea580c",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
  "#dc2626",
] as const;

/**
 * 用用户标识稳定地挑一个颜色：同一个人每次进来都是同一个色，
 * 不同人大概率不同色。纯函数，服务端签发与前端展示共用。
 */
export function collabUserColor(userId: string | number): string {
  const key = String(userId);
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    // 经典 djb2 变体；只要稳定且分布均匀即可，不需要密码学强度
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  const slot = Math.abs(hash) % COLLAB_USER_COLORS.length;
  return COLLAB_USER_COLORS[slot] as string;
}

/** 展示名优先级：昵称 > 用户名 > 「用户 <id>」。 */
export function collabUserName(profile: {
  nickname?: string | null | undefined;
  username?: string | null | undefined;
  id?: number | null | undefined;
}): string {
  return profile.nickname?.trim() || profile.username?.trim() || `用户 ${profile.id ?? "?"}`;
}
