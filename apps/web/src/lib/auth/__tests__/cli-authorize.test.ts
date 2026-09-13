import { describe, expect, it } from "vitest";
import {
  buildLoginRedirect,
  buildLoopbackCallbackUrl,
  parseCliAuthorizeParams,
} from "../cli-authorize";

const valid = { port: "51234", state: "st-ate_1", challenge: "ch-allenge_1" };
const query = (overrides: Record<string, string | undefined> = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...valid, ...overrides })) {
    if (value !== undefined) params.set(key, value);
  }
  return params;
};

describe("parseCliAuthorizeParams", () => {
  it("接受合法参数", () => {
    const result = parseCliAuthorizeParams(query());
    expect(result).toEqual({
      ok: true,
      params: { port: 51234, state: "st-ate_1", challenge: "ch-allenge_1" },
    });
  });

  it.each([undefined, "", "abc", "80abc", "-1", "12.5", "999999", " 51234"])(
    "拒绝非法 port：%s",
    (port) => {
      const result = parseCliAuthorizeParams(query({ port }));
      expect(result.ok).toBe(false);
    },
  );

  it.each(["1023", "0", "80"])("拒绝特权端口 %s（内核不会把特权端口分给普通进程）", (port) => {
    expect(parseCliAuthorizeParams(query({ port })).ok).toBe(false);
  });

  it("接受端口边界 1024 与 65535", () => {
    expect(parseCliAuthorizeParams(query({ port: "1024" })).ok).toBe(true);
    expect(parseCliAuthorizeParams(query({ port: "65535" })).ok).toBe(true);
  });

  it.each([
    ["state", undefined],
    ["challenge", undefined],
    ["state", ""],
    ["challenge", ""],
    ["state", "has space"],
    ["state", "has/slash"],
    ["state", "has=equals"],
    ["challenge", "a".repeat(129)],
  ])("拒绝非法 %s：%s", (key, value) => {
    const result = parseCliAuthorizeParams(query({ [key]: value }));
    expect(result.ok).toBe(false);
  });

  it("缺少参数时给出可读原因，附带是哪个字段", () => {
    const result = parseCliAuthorizeParams(query({ state: undefined }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("state");
  });
});

describe("buildLoopbackCallbackUrl", () => {
  it("固定指向 127.0.0.1（localhost 在双栈机器上可能解析到 ::1）", () => {
    const url = buildLoopbackCallbackUrl(51234, { code: "c", state: "s" });
    expect(url).toBe("http://127.0.0.1:51234/callback?code=c&state=s");
  });

  it("参数被正确编码", () => {
    const url = new URL(buildLoopbackCallbackUrl(1, { code: "a&b", state: "c=d" }));
    expect(url.searchParams.get("code")).toBe("a&b");
    expect(url.searchParams.get("state")).toBe("c=d");
  });
});

describe("buildLoginRedirect", () => {
  it("next 指向授权页并保留全部原始参数（登录后能回到原流程）", () => {
    const target = buildLoginRedirect({ port: 51234, state: "st", challenge: "ch" });
    expect(target.startsWith("/login?next=")).toBe(true);

    const decoded = decodeURIComponent(target.slice("/login?next=".length));
    const parsed = new URL(`http://x.test${decoded}`);
    expect(parsed.pathname).toBe("/cli/authorize");
    expect(parsed.searchParams.get("port")).toBe("51234");
    expect(parsed.searchParams.get("state")).toBe("st");
    expect(parsed.searchParams.get("challenge")).toBe("ch");
  });

  it("参数里的 & 不会截断 next", () => {
    const target = buildLoginRedirect({ port: 1, state: "a&b", challenge: "c" });
    const decoded = decodeURIComponent(target.slice("/login?next=".length));
    expect(new URL(`http://x.test${decoded}`).searchParams.get("state")).toBe("a&b");
  });
});
