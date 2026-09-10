// @vitest-environment node
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthCookies, setAuthCookies } from "../cookies";

vi.mock("server-only", () => ({}));

function jwt(payload: unknown) {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
});
afterEach(() => vi.useRealTimers());

describe("认证 Cookie", () => {
  it.each([{}, { exp: 99 }, { exp: 100 }, { exp: "200" }, { exp: null }, { exp: 1e100 }])(
    "拒绝缺失、过期或非法 exp：%j",
    (payload) => {
      const response = NextResponse.json({});
      expect(() =>
        setAuthCookies(response, {
          accessToken: jwt({ exp: 200 }),
          refreshToken: jwt(payload),
        }),
      ).toThrow();
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it("无效 Token 不会只覆盖一个 Cookie", () => {
    const response = NextResponse.json({});
    expect(() =>
      setAuthCookies(response, {
        accessToken: jwt({ exp: 200 }),
        refreshToken: "invalid",
      }),
    ).toThrow();
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("清除 Cookie 时沿用相同路径和安全属性", () => {
    const response = clearAuthCookies(NextResponse.json({}));
    for (const name of ["at", "rt"]) {
      expect(response.cookies.get(name)).toMatchObject({
        value: "",
        expires: new Date(0),
        maxAge: 0,
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
      });
    }
  });
});
