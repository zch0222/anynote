import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { COLLAB_TOKEN_AUDIENCE, COLLAB_TOKEN_ISSUER } from "../auth.ts";
import type { CollabConfig } from "../config.ts";
import { authorizeUpgrade } from "../upgrade.ts";

const secret = "a-very-long-dev-secret";
const origin = "http://localhost:3000";

const config: CollabConfig = {
  host: "0.0.0.0",
  port: 1234,
  tokenSecret: secret,
  persistenceDir: null,
  allowedOrigins: [origin],
};

/** 默认签一枚绑定 note:42 的令牌；可在 claims 上覆盖 room / ro。 */
function token(claims: { room?: string | undefined; ro?: boolean } = {}, expiresIn = "5m") {
  const payload: Record<string, unknown> = { name: "甲", color: "#2563eb" };
  // room 显式传 undefined 时**不写入 claim**，用于测「缺 room」这条路径
  if (!("room" in claims) || claims.room !== undefined) {
    payload.room = claims.room ?? "note:42";
  }
  if (claims.ro !== undefined) payload.ro = claims.ro;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(COLLAB_TOKEN_ISSUER)
    .setAudience(COLLAB_TOKEN_AUDIENCE)
    .setSubject("7")
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

describe("authorizeUpgrade", () => {
  it("令牌、来源、房间都合法时放行并回传身份、规范房间名与只读标志", async () => {
    const decision = await authorizeUpgrade(`/note:42?token=${await token()}`, origin, config);
    expect(decision).toEqual({
      ok: true,
      room: "note:42",
      session: { identity: { userId: "7", name: "甲", color: "#2563eb" }, ro: false },
    });
  });

  it("ro=true 的令牌放行但带出只读标志", async () => {
    const decision = await authorizeUpgrade(
      `/note:42?token=${await token({ ro: true })}`,
      origin,
      config,
    );
    expect(decision).toMatchObject({ ok: true, session: { ro: true } });
  });

  it("令牌房间与握手房间不一致时 403（越权面的核心修复）", async () => {
    const other = await token({ room: "note:7" });
    const decision = await authorizeUpgrade(`/note:42?token=${other}`, origin, config);
    expect(decision).toEqual({ ok: false, status: 403, message: expect.any(String) });
  });

  it("令牌缺 room 声明时 401（视为非法令牌，而不是放行）", async () => {
    const noRoom = await token({ room: undefined });
    const decision = await authorizeUpgrade(`/note:42?token=${noRoom}`, origin, config);
    expect(decision).toMatchObject({ ok: false, status: 401 });
  });

  it("房间名非法时 400（先于鉴权，避免把令牌用在无效房间上）", async () => {
    const decision = await authorizeUpgrade(`/note:0?token=${await token()}`, origin, config);
    expect(decision).toEqual({ ok: false, status: 400, message: expect.any(String) });
  });

  it("已退役的 index / doc: 房间一律 400", async () => {
    for (const room of ["/index", "/doc:abcdefgh"]) {
      expect(
        await authorizeUpgrade(`${room}?token=${await token()}`, origin, config),
      ).toMatchObject({
        ok: false,
        status: 400,
      });
    }
  });

  it("缺令牌时 400", async () => {
    expect(await authorizeUpgrade("/note:42", origin, config)).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("来源不在白名单时 403", async () => {
    const url = `/note:42?token=${await token()}`;
    expect(await authorizeUpgrade(url, "http://evil.example", config)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await authorizeUpgrade(url, undefined, config)).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("令牌无效或过期时 401", async () => {
    expect(await authorizeUpgrade("/note:42?token=garbage", origin, config)).toMatchObject({
      ok: false,
      status: 401,
    });
    const expired = await token({}, "-1s");
    expect(await authorizeUpgrade(`/note:42?token=${expired}`, origin, config)).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("白名单为空时不校验来源", async () => {
    const relaxed: CollabConfig = { ...config, allowedOrigins: [] };
    const decision = await authorizeUpgrade(`/note:42?token=${await token()}`, undefined, relaxed);
    expect(decision.ok).toBe(true);
  });
});
