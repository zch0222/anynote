import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  COLLAB_TOKEN_AUDIENCE,
  COLLAB_TOKEN_ISSUER,
  CollabAuthError,
  isOriginAllowed,
  verifyCollabToken,
} from "../auth.ts";

const secret = "a-very-long-dev-secret";
const key = new TextEncoder().encode(secret);

type Claims = { sub?: string; name?: unknown; color?: unknown; room?: unknown; ro?: unknown };

async function sign(
  claims: Claims,
  options: { issuer?: string; audience?: string; expiresIn?: string; key?: Uint8Array } = {},
) {
  const { sub, ...rest } = claims;
  let jwt = new SignJWT(rest as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(options.issuer ?? COLLAB_TOKEN_ISSUER)
    .setAudience(options.audience ?? COLLAB_TOKEN_AUDIENCE)
    .setExpirationTime(options.expiresIn ?? "5m");
  if (sub !== undefined) jwt = jwt.setSubject(sub);
  return jwt.sign(options.key ?? key);
}

/** 一枚合法令牌：身份 + 房间 + 只读标志齐全。 */
function valid(overrides: Claims = {}) {
  return sign({
    sub: "7",
    name: "测试用户",
    color: "#2563eb",
    room: "note:42",
    ro: false,
    ...overrides,
  });
}

describe("verifyCollabToken", () => {
  it("解出身份、房间与只读标志", async () => {
    await expect(verifyCollabToken(await valid(), secret)).resolves.toEqual({
      identity: { userId: "7", name: "测试用户", color: "#2563eb" },
      room: "note:42",
      ro: false,
    });
  });

  it("ro 只在严格为 true 时为真，缺省或非 true 一律按可写处理", async () => {
    for (const ro of [true, false, undefined, "true", 1, null]) {
      const claims = await verifyCollabToken(await valid({ ro }), secret);
      expect(claims.ro).toBe(ro === true);
    }
  });

  it("缺 room 声明一律拒绝（灰度期旧前端令牌不得绕过房间绑定）", async () => {
    for (const room of [undefined, "", 42, null]) {
      await expect(verifyCollabToken(await valid({ room }), secret)).rejects.toThrow(
        /缺少房间声明/,
      );
    }
  });

  it("昵称缺失或空白时退回用户标识，颜色非法时退回默认色", async () => {
    for (const name of [undefined, "   ", 42]) {
      const token = await valid({ name, color: "not-a-color" });
      await expect(verifyCollabToken(token, secret)).resolves.toMatchObject({
        identity: { userId: "7", name: "7", color: "#64748b" },
      });
    }
  });

  it("换密钥签的令牌一律拒绝", async () => {
    const token = await sign(
      { sub: "7", room: "note:42" },
      { key: new TextEncoder().encode("another-long-secret") },
    );
    await expect(verifyCollabToken(token, secret)).rejects.toBeInstanceOf(CollabAuthError);
  });

  it("签发方或受众不符时拒绝（防止别处的 JWT 被复用）", async () => {
    const wrongIssuer = await sign({ sub: "7", room: "note:42" }, { issuer: "someone-else" });
    const wrongAudience = await sign(
      { sub: "7", room: "note:42" },
      { audience: "anynote-gateway" },
    );
    await expect(verifyCollabToken(wrongIssuer, secret)).rejects.toBeInstanceOf(CollabAuthError);
    await expect(verifyCollabToken(wrongAudience, secret)).rejects.toBeInstanceOf(CollabAuthError);
  });

  it("过期令牌拒绝", async () => {
    const token = await sign({ sub: "7", room: "note:42" }, { expiresIn: "-1s" });
    await expect(verifyCollabToken(token, secret)).rejects.toBeInstanceOf(CollabAuthError);
  });

  it("缺少 sub 时拒绝", async () => {
    const token = await sign({ room: "note:42" });
    await expect(verifyCollabToken(token, secret)).rejects.toThrow(/缺少用户标识/);
  });

  it("完全不是 JWT 的字符串拒绝", async () => {
    await expect(verifyCollabToken("not-a-token", secret)).rejects.toBeInstanceOf(CollabAuthError);
  });
});

describe("isOriginAllowed", () => {
  it("白名单为空时不校验", () => {
    expect(isOriginAllowed(undefined, [])).toBe(true);
    expect(isOriginAllowed("http://evil.example", [])).toBe(true);
  });

  it("白名单非空时必须精确命中，缺 Origin 也拒绝", () => {
    const allowed = ["http://localhost:3000"];
    expect(isOriginAllowed("http://localhost:3000", allowed)).toBe(true);
    expect(isOriginAllowed("http://localhost:3001", allowed)).toBe(false);
    expect(isOriginAllowed(undefined, allowed)).toBe(false);
  });
});
