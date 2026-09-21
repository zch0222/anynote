import { setAuthCookies } from "@/lib/auth/cookies";
import { authResponse, checkOrigin } from "@/lib/auth/http";
import { loadCollabGrant, loadSessionProfile } from "@/lib/auth/profile";
import {
  COLLAB_TOKEN_AUDIENCE,
  COLLAB_TOKEN_ISSUER,
  COLLAB_TOKEN_TTL_SECONDS,
  collabUserColor,
  collabUserName,
} from "@/lib/collab/identity";
import { collabNoteRoom } from "@/lib/collab/rooms";
import { env } from "@/lib/env";
import { SignJWT } from "jose";
import type { NextRequest } from "next/server";

/**
 * 签发协同服务专用的短期令牌。
 *
 * 为什么不直接把 accessToken 给浏览器：它是 httpOnly Cookie，前端 JS 永远拿不到，
 * 而浏览器的 WebSocket 构造函数又没法自定义请求头。所以这里换一枚**另一套密钥签的**、
 * 五分钟有效、只被协同服务认的令牌——泄露了也调不动 Gateway 上的任何业务接口。
 *
 * 与旧实现的关键差异（方案 §7.1 / D2）：请求体带 `noteId`，签发前先按当前会话身份
 * 查一次协同准入；令牌里带上 `room` 与 `ro`，协同服务据此强制「令牌房间 = 握手房间」，
 * 顺带修掉「任何登录用户可写任意房间」的越权缺陷。无权限（perm = NONE）直接 403 不签。
 */
export async function POST(request: NextRequest) {
  const forbidden = checkOrigin(request);
  if (forbidden) return forbidden;

  const body = await readNoteId(request);
  if (!body.ok) return body.response;

  const outcome = await loadSessionProfile(request);
  if (!outcome.ok) return outcome.response;

  const { profile } = outcome;
  if (profile.id === null || profile.id === undefined) {
    // 没有用户主键就无法给协同服务一个稳定身份，宁可拒发也不编一个。
    return authResponse("B0400", "当前账号缺少用户标识，无法加入协同", null, 502);
  }

  // 准入必须以「会话刚刷新出来的 accessToken」查，不能用 Cookie 里的旧值。
  const accessToken = outcome.rotated?.accessToken ?? request.cookies.get("at")?.value;
  if (!accessToken) {
    // loadSessionProfile 成功但拿不到可用 accessToken：属于异常装配，不猜。
    return authResponse("B0400", "会话不可用，无法加入协同", null, 502);
  }

  const grantOutcome = await loadCollabGrant(accessToken, body.noteId);
  if (!grantOutcome.ok) return grantOutcome.response;
  const { grant } = grantOutcome;

  if (grant.perm === "NONE") {
    // 无权限不签令牌：前端拿到 403 会退回单人只读链路（D8）。
    return authResponse("A0301", "没有权限参与该笔记的协同编辑", null, 403);
  }

  const userId = String(profile.id);
  const name = collabUserName(profile);
  const color = collabUserColor(userId);
  const room = collabNoteRoom(body.noteId);
  // 权限低于 EDIT（即 READ）为只读：服务端会丢弃该连接的写方向消息。
  const ro = grant.perm === "READ";

  const token = await new SignJWT({ name, color, room, ro })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(COLLAB_TOKEN_ISSUER)
    .setAudience(COLLAB_TOKEN_AUDIENCE)
    .setSubject(userId)
    .setExpirationTime(`${COLLAB_TOKEN_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(env.COLLAB_TOKEN_SECRET));

  const response = authResponse("00000", "操作成功", {
    token,
    expiresIn: COLLAB_TOKEN_TTL_SECONDS,
    user: { id: userId, name, color },
  });
  // 取资料时顺带刷新过 Token 的话，把新 Cookie 一起带回去。
  if (outcome.rotated) setAuthCookies(response, outcome.rotated);
  return response;
}

type NoteIdOutcome = { ok: true; noteId: number } | { ok: false; response: Response };

/**
 * 解析请求体里的 `noteId`。必须是正安全整数——它会被直接拼进 JWT 的 `room` claim，
 * 拿到脏值等于把非法房间名带进协同服务（虽然那边也会拒，但错误会变成误导性的 403）。
 */
async function readNoteId(request: NextRequest): Promise<NoteIdOutcome> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: authResponse("A0160", "请求体必须是合法 JSON", null, 400) };
  }

  const noteId = (raw as { noteId?: unknown } | null)?.noteId;
  if (typeof noteId !== "number" || !Number.isSafeInteger(noteId) || noteId <= 0) {
    return { ok: false, response: authResponse("A0160", "noteId 必须是正整数", null, 400) };
  }
  return { ok: true, noteId };
}
