import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CODE_VERIFIER_BYTES,
  buildAuthorizeUrl,
  createAuthorizationSecrets,
  createCodeChallenge,
  createCodeVerifier,
} from "../auth/pkce";

describe("PKCE S256", () => {
  it("verifier 是 base64url 且长度符合 RFC 7636 的 43–128 区间", () => {
    const verifier = createCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    // 32 字节做 base64url（无填充）恰好 43 字符
    expect(verifier.length).toBe(Math.ceil((CODE_VERIFIER_BYTES * 4) / 3));
  });

  it("challenge 等于标准 S256 结果（服务端按 RFC 复算必须一致）", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expected = createHash("sha256").update(verifier, "ascii").digest("base64url");
    expect(createCodeChallenge(verifier)).toBe(expected);
    // RFC 7636 附录 B 的官方测试向量
    expect(createCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("每次生成的 verifier / state 都不同", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const secrets = createAuthorizationSecrets();
      seen.add(`${secrets.state}:${secrets.codeVerifier}`);
    }
    expect(seen.size).toBe(50);
  });

  it("createAuthorizationSecrets 返回的三个值自洽", () => {
    const secrets = createAuthorizationSecrets();
    expect(secrets.codeChallenge).toBe(createCodeChallenge(secrets.codeVerifier));
    expect(secrets.state).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("buildAuthorizeUrl", () => {
  const secrets = { state: "st-ate", codeChallenge: "ch-allenge" };

  it("指向 /cli/authorize 并带齐三个参数", () => {
    const url = new URL(buildAuthorizeUrl("http://localhost:3000", secrets, 51234));
    expect(url.origin).toBe("http://localhost:3000");
    expect(url.pathname).toBe("/cli/authorize");
    expect(url.searchParams.get("port")).toBe("51234");
    expect(url.searchParams.get("state")).toBe("st-ate");
    expect(url.searchParams.get("challenge")).toBe("ch-allenge");
  });

  it("末尾斜杠不会拼出双斜杠", () => {
    expect(buildAuthorizeUrl("http://localhost:3000/", secrets, 1)).toContain(
      "http://localhost:3000/cli/authorize",
    );
  });

  it("反代在子路径下时保留前缀，不把用户带到站点根", () => {
    const url = new URL(buildAuthorizeUrl("https://notes.example.com/anynote", secrets, 1));
    expect(url.pathname).toBe("/anynote/cli/authorize");
  });

  it("参数里的特殊字符被正确编码，不会截断查询串", () => {
    const url = buildAuthorizeUrl(
      "http://localhost:3000",
      { state: "a&b=c", codeChallenge: "x?y" },
      1,
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("state")).toBe("a&b=c");
    expect(parsed.searchParams.get("challenge")).toBe("x?y");
  });
});
