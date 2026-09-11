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

function token(expiresIn = "5m") {
  return new SignJWT({ name: "甲", color: "#2563eb" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(COLLAB_TOKEN_ISSUER)
    .setAudience(COLLAB_TOKEN_AUDIENCE)
    .setSubject("7")
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

describe("authorizeUpgrade", () => {
  it("令牌、来源、房间都合法时放行并回传身份与规范房间名", async () => {
    const decision = await authorizeUpgrade(`/doc:abcdefgh?token=${await token()}`, origin, config);
    expect(decision).toEqual({
      ok: true,
      room: "doc:abcdefgh",
      identity: { userId: "7", name: "甲", color: "#2563eb" },
    });
  });

  it("房间名非法时 400（先于鉴权，避免把令牌用在无效房间上）", async () => {
    const decision = await authorizeUpgrade(`/doc:../x?token=${await token()}`, origin, config);
    expect(decision).toEqual({ ok: false, status: 400, message: expect.any(String) });
  });

  it("缺令牌时 400", async () => {
    expect(await authorizeUpgrade("/index", origin, config)).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("来源不在白名单时 403", async () => {
    const url = `/index?token=${await token()}`;
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
    expect(await authorizeUpgrade("/index?token=garbage", origin, config)).toMatchObject({
      ok: false,
      status: 401,
    });
    const expired = await token("-1s");
    expect(await authorizeUpgrade(`/index?token=${expired}`, origin, config)).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("白名单为空时不校验来源", async () => {
    const relaxed: CollabConfig = { ...config, allowedOrigins: [] };
    const decision = await authorizeUpgrade(`/index?token=${await token()}`, undefined, relaxed);
    expect(decision.ok).toBe(true);
  });
});
