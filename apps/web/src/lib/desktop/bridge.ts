import { unwrapEnvelope } from "@/lib/api/errors";
import { z } from "zod";

/**
 * 桌面壳桥接。
 *
 * 仓库规约禁止把 Token 写进 localStorage（必须 httpOnly Cookie）——**这里是唯一例外**，
 * 由 FRONTEND_MILESTONES 风险表 M8.2「桌面专用 /api/auth/exchange 端点：换长 token
 * 写 localStorage（仅桌面环境）」授权：桌面壳是独立进程，httpOnly Cookie 跨进程不可用。
 *
 * 例外只在桌面壳里成立，且不靠前端自觉：
 * 换取 Token 必须同时满足「带对客户端密钥」与「Origin 在桌面白名单里」，
 * 两个条件都由 BFF 的 /api/auth/exchange 校验，浏览器页面无论如何都换不到。
 */
export const DESKTOP_TOKEN_STORAGE_KEY = "anynote.desktop.session";

/** Tauri 壳在页面加载前注入的全局标记（见 apps/desktop/src-tauri/src/lib.rs）。 */
export const DESKTOP_GLOBAL_KEY = "__ANYNOTE_DESKTOP__";

const bridgeSchema = z.object({ exchangeKey: z.string().min(1) });

export const desktopSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().int().positive().nullable(),
  user: z.object({ id: z.number().nullable(), nickname: z.string().nullable() }),
});

export type DesktopBridge = z.infer<typeof bridgeSchema>;
export type DesktopSession = z.infer<typeof desktopSessionSchema>;

/** 读桌面标记。不在桌面壳里（或标记结构不对）时返回 null。 */
export function readDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const raw = (window as unknown as Record<string, unknown>)[DESKTOP_GLOBAL_KEY];
  const parsed = bridgeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function isDesktopShell(): boolean {
  return readDesktopBridge() !== null;
}

/** 用会话 Cookie 换取桌面可自行保管的 Token。非桌面环境直接抛错，避免被误调。 */
export async function exchangeDesktopSession(
  bridge: DesktopBridge | null = readDesktopBridge(),
): Promise<DesktopSession> {
  if (!bridge) throw new Error("当前不在桌面壳中，不能交换令牌");

  const response = await fetch("/api/auth/exchange", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "x-anynote-desktop-key": bridge.exchangeKey,
    },
  });
  return unwrapEnvelope(response, desktopSessionSchema.parse);
}

/** 落盘到 localStorage。非桌面环境是空操作——这是那条禁令的兜底护栏。 */
export function storeDesktopSession(session: DesktopSession): boolean {
  if (!isDesktopShell()) return false;
  try {
    window.localStorage.setItem(DESKTOP_TOKEN_STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    // 隐私模式等场景写入会抛错；桌面壳退回 Cookie 会话即可，不该炸页面
    return false;
  }
}

/** 读回已保管的会话；结构不对或已过期一律当作没有。 */
export function readDesktopSession(now = Date.now()): DesktopSession | null {
  if (!isDesktopShell()) return null;
  try {
    const raw = window.localStorage.getItem(DESKTOP_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = desktopSessionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (parsed.data.expiresAt !== null && parsed.data.expiresAt <= now) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function clearDesktopSession(): void {
  try {
    window.localStorage.removeItem(DESKTOP_TOKEN_STORAGE_KEY);
  } catch {
    // 读写 localStorage 本身就可能抛错，清理失败不值得中断登出流程
  }
}
