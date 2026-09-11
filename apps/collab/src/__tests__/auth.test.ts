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

type Claims = { sub?: string; name?: unknown; color?: unknown };

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

describe("verifyCollabToken", () => {
  it("解出用户标识、昵称与颜色", async () => {
    const token = await sign({ sub: "7", name: "测试用户", color: "#2563eb" });
    await expect(verifyCollabToken(token, secret)).resolves.toEqual({
      userId: "7",
      name: "测试用户",
      color: "#2563eb",
    });
  });

  it("昵称缺失或空白时退回用户标识，颜色非法时退回默认色", async () => {
    for (const name of [undefined, "   ", 42]) {
      const token = await sign({ sub: "7", name, color: "not-a-color" });
      await expect(verifyCollabToken(token, secret)).resolves.toEqual({
        userId: "7",
        name: "7",
        color: "#64748b",
      });
    }
  });

  it("换密钥签的令牌一律拒绝", async () => {
    const token = await sign(
      { sub: "7" },
      { key: new TextEncoder().encode("another-long-secret") },
    );
    await expect(verifyCollabToken(token, secret)).rejects.toBeInstanceOf(CollabAuthError);
  });

  it("签发方或受众不符时拒绝（防止别处的 JWT 被复用）", async () => {
    const wrongIssuer = await sign({ sub: "7" }, { issuer: "someone-else" });
    const wrongAudience = await sign({ sub: "7" }, { audience: "anynote-gateway" });
    await expect(verifyCollabToken(wrongIssuer, secret)).rejects.toBeInstanceOf(CollabAuthError);
    await expect(verifyCollabToken(wrongAudience, secret)).rejects.toBeInstanceOf(CollabAuthError);
  });

  it("过期令牌拒绝", async () => {
    const token = await sign({ sub: "7" }, { expiresIn: "-1s" });
    await expect(verifyCollabToken(token, secret)).rejects.toBeInstanceOf(CollabAuthError);
  });

  it("缺少 sub 时拒绝", async () => {
    const token = await sign({});
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
