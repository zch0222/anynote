import { ApiError } from "@/lib/api/errors";
import {
  DESKTOP_GLOBAL_KEY,
  DESKTOP_TOKEN_STORAGE_KEY,
  type DesktopSession,
  clearDesktopSession,
  exchangeDesktopSession,
  isDesktopShell,
  readDesktopBridge,
  readDesktopSession,
  storeDesktopSession,
} from "@/lib/desktop/bridge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session: DesktopSession = {
  accessToken: "at-1",
  refreshToken: "rt-1",
  expiresAt: 2_000_000_000_000,
  user: { id: 7, nickname: "测试用户" },
};

function enterShell(exchangeKey = "a-very-long-desktop-key") {
  (window as unknown as Record<string, unknown>)[DESKTOP_GLOBAL_KEY] = { exchangeKey };
}

function envelope(data: unknown, code = "00000", status = 200) {
  return new Response(JSON.stringify({ code, msg: "操作成功", data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, DESKTOP_GLOBAL_KEY);
});
afterEach(() => vi.unstubAllGlobals());

describe("桌面壳识别", () => {
  it("没有注入标记时判定为普通浏览器", () => {
    expect(readDesktopBridge()).toBeNull();
    expect(isDesktopShell()).toBe(false);
  });

  it("标记结构不对时同样不认（防止页面里随手挂个同名全局）", () => {
    (window as unknown as Record<string, unknown>)[DESKTOP_GLOBAL_KEY] = { exchangeKey: "" };
    expect(isDesktopShell()).toBe(false);
    (window as unknown as Record<string, unknown>)[DESKTOP_GLOBAL_KEY] = "desktop";
    expect(isDesktopShell()).toBe(false);
  });

  it("壳注入合法标记时识别成功", () => {
    enterShell();
    expect(readDesktopBridge()).toEqual({ exchangeKey: "a-very-long-desktop-key" });
    expect(isDesktopShell()).toBe(true);
  });
});

describe("exchangeDesktopSession", () => {
  it("带客户端密钥请求 BFF 并拆信封", async () => {
    enterShell();
    const fetchMock = vi.fn().mockResolvedValue(envelope(session));
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeDesktopSession()).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/exchange",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({ "x-anynote-desktop-key": "a-very-long-desktop-key" }),
      }),
    );
  });

  it("不在桌面壳里直接抛错，绝不发请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeDesktopSession()).rejects.toThrow(/不在桌面壳/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("BFF 拒绝（端点未启用 / Origin 不符）时抛 ApiError", async () => {
    enterShell();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(envelope(null, "A0301", 403)));

    await expect(exchangeDesktopSession()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("会话保管", () => {
  it("桌面壳里才写 localStorage", () => {
    expect(storeDesktopSession(session)).toBe(false);
    expect(window.localStorage.getItem(DESKTOP_TOKEN_STORAGE_KEY)).toBeNull();

    enterShell();
    expect(storeDesktopSession(session)).toBe(true);
    expect(window.localStorage.getItem(DESKTOP_TOKEN_STORAGE_KEY)).toContain("at-1");
  });

  it("写入的会话能原样读回", () => {
    enterShell();
    storeDesktopSession(session);
    expect(readDesktopSession(1_000)).toEqual(session);
  });

  it("浏览器环境读不到已存的会话（哪怕有人手动塞进 localStorage）", () => {
    window.localStorage.setItem(DESKTOP_TOKEN_STORAGE_KEY, JSON.stringify(session));
    expect(readDesktopSession(1_000)).toBeNull();
  });

  it("已过期的会话视为不存在", () => {
    enterShell();
    storeDesktopSession(session);
    expect(readDesktopSession(session.expiresAt as number)).toBeNull();
    expect(readDesktopSession((session.expiresAt as number) + 1)).toBeNull();
  });

  it("expiresAt 为 null 时不做过期判断", () => {
    enterShell();
    storeDesktopSession({ ...session, expiresAt: null });
    expect(readDesktopSession(Number.MAX_SAFE_INTEGER)).toMatchObject({ expiresAt: null });
  });

  it("存量数据结构不合法时当作没有，而不是抛错", () => {
    enterShell();
    window.localStorage.setItem(DESKTOP_TOKEN_STORAGE_KEY, "not-json");
    expect(readDesktopSession()).toBeNull();
    window.localStorage.setItem(DESKTOP_TOKEN_STORAGE_KEY, JSON.stringify({ accessToken: "" }));
    expect(readDesktopSession()).toBeNull();
  });

  it("localStorage 不可用时写入失败但不抛错", () => {
    enterShell();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    expect(storeDesktopSession(session)).toBe(false);
  });

  it("clear 清掉保管的会话，且在异常时不中断登出", () => {
    enterShell();
    storeDesktopSession(session);
    clearDesktopSession();
    expect(readDesktopSession()).toBeNull();

    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => clearDesktopSession()).not.toThrow();
  });
});
