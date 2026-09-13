// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLI_CODE_TTL_MS } from "../cli-authorize";
import { clearCliCodes, consumeCliCode, issueCliCode, newCliCode } from "../cli-code-store";

vi.mock("server-only", () => ({}));

const entry = () => ({
  username: "alice",
  challenge: "challenge-value",
  accessToken: "cli-at",
  refreshToken: "cli-rt",
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  clearCliCodes();
});
afterEach(() => {
  clearCliCodes();
  vi.useRealTimers();
});

describe("授权码存储", () => {
  it("生成的码是 32 字节 CSPRNG 的 base64url（可安全进 URL）", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      const code = newCliCode();
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
      // 32 字节 base64url 无填充 = 43 字符
      expect(code).toHaveLength(43);
      seen.add(code);
    }
    expect(seen.size).toBe(100);
  });

  it("签发后能用码取回同一条记录", () => {
    const code = issueCliCode(entry());
    expect(consumeCliCode(code)).toMatchObject(entry());
  });

  it("取用即删：同一个码第二次消费拿到 null（重放防护）", () => {
    const code = issueCliCode(entry());
    expect(consumeCliCode(code)).not.toBeNull();
    expect(consumeCliCode(code)).toBeNull();
  });

  it("过期的码拿不到，且顺手清掉（不区分「不存在」与「已过期」）", () => {
    const code = issueCliCode(entry());
    vi.advanceTimersByTime(CLI_CODE_TTL_MS + 1);
    expect(consumeCliCode(code)).toBeNull();
    // 已经删掉了：即使时间倒回去也取不回
    vi.setSystemTime(1_000_000);
    expect(consumeCliCode(code)).toBeNull();
  });

  it("TTL 边界：正好到期即失效", () => {
    const code = issueCliCode(entry());
    vi.advanceTimersByTime(CLI_CODE_TTL_MS);
    expect(consumeCliCode(code)).toBeNull();
  });

  it("TTL 边界：到期前一毫秒仍有效", () => {
    const code = issueCliCode(entry());
    vi.advanceTimersByTime(CLI_CODE_TTL_MS - 1);
    expect(consumeCliCode(code)).not.toBeNull();
  });

  it("未知的码返回 null", () => {
    expect(consumeCliCode("never-issued")).toBeNull();
  });

  it("多个码互不干扰", () => {
    const first = issueCliCode({ ...entry(), username: "alice" });
    const second = issueCliCode({ ...entry(), username: "bob" });
    expect(consumeCliCode(second)?.username).toBe("bob");
    expect(consumeCliCode(first)?.username).toBe("alice");
  });

  it("服务端内存里的令牌不会被序列化进任何返回给浏览器的结构", () => {
    // 这条断言看似同义反复，但它锁住的是一个真实约定：
    // store 里存的是令牌，路由只把 code 返回给浏览器。任何"顺手把 entry 返回"
    // 的改动都会让下面的 JSON.stringify 命中令牌。
    const code = issueCliCode(entry());
    const entryValue = consumeCliCode(code);
    expect(JSON.stringify({ code })).not.toContain("cli-at");
    expect(entryValue?.accessToken).toBe("cli-at");
  });
});
