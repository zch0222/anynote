// @vitest-environment node
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthCookies, setAuthCookies } from "../cookies";

const { env } = vi.hoisted(() => ({
  env: {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: undefined as string | undefined,
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  },
}));
vi.mock("@/lib/env", () => ({ env }));
vi.mock("server-only", () => ({}));

function jwt(payload: unknown) {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  env.NODE_ENV = "test";
  env.DEPLOYMENT_ENV = undefined;
  env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
});
afterEach(() => vi.useRealTimers());

describe("认证 Cookie", () => {
  it.each([
    ["production", "development", "http://192.168.3.90:3000", false],
    ["development", undefined, "http://192.168.3.90:3000", false],
    ["development", undefined, "https://notes.example.com", true],
    ["production", "development", "https://notes.example.com", true],
    ["production", undefined, "http://192.168.3.90:3000", true],
    ["production", "production", "https://notes.example.com", true],
    ["development", "production", "http://192.168.3.90:3000", true],
  ])("%s / %s / %s 的签发与清除属性一致", (nodeEnv, deploymentEnv, appUrl, secure) => {
    env.NODE_ENV = nodeEnv;
    env.DEPLOYMENT_ENV = deploymentEnv;
    env.NEXT_PUBLIC_APP_URL = appUrl;
    const response = NextResponse.json({});
    setAuthCookies(response, {
      accessToken: jwt({ exp: 200 }),
      refreshToken: jwt({ exp: 300 }),
    });
    const cleared = clearAuthCookies(NextResponse.json({}));
    for (const name of ["at", "rt"]) {
      for (const result of [response, cleared]) {
        expect(result.cookies.get(name)).toMatchObject({
          httpOnly: true,
          secure,
          sameSite: "strict",
          path: "/",
        });
      }
    }
  });

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
