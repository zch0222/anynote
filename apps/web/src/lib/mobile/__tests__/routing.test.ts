import {
  MOBILE_HOME,
  VIEW_COOKIE,
  isMobileUserAgent,
  parseViewPreference,
  readViewOverride,
  resolveViewDecision,
} from "@/lib/mobile/routing";
import { describe, expect, it } from "vitest";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

describe("isMobileUserAgent", () => {
  it("iPhone 与 Android 手机判为手机", () => {
    expect(isMobileUserAgent(IPHONE)).toBe(true);
    expect(isMobileUserAgent(ANDROID_PHONE)).toBe(true);
  });

  it("平板不算手机——决策 7 定的是平板落桌面窄屏形态", () => {
    // iPad 的 UA 里同时有 iPad 和 Mobile，先判平板才不会被 Mobile 带偏
    expect(isMobileUserAgent(IPAD)).toBe(false);
    // Android 平板与手机的差别就是 UA 里没有 Mobile 这个词
    expect(isMobileUserAgent(ANDROID_TABLET)).toBe(false);
  });

  it("桌面浏览器不算手机", () => {
    expect(isMobileUserAgent(WINDOWS)).toBe(false);
    expect(isMobileUserAgent(MAC)).toBe(false);
  });

  it("空 UA 按桌面处理，不做猜测", () => {
    expect(isMobileUserAgent(null)).toBe(false);
    expect(isMobileUserAgent(undefined)).toBe(false);
    expect(isMobileUserAgent("")).toBe(false);
  });

  it("伪造 / 非常规 UA 里带 Mobi 的按手机处理", () => {
    expect(isMobileUserAgent("Opera/9.80 (J2ME/MIDP; Opera Mini/9)")).toBe(true);
    expect(isMobileUserAgent("SomeBot/1.0")).toBe(false);
  });
});

describe("parseViewPreference", () => {
  it("只认两个字面量，其余按未设置", () => {
    expect(parseViewPreference("mobile")).toBe("mobile");
    expect(parseViewPreference("desktop")).toBe("desktop");
    expect(parseViewPreference("MOBILE")).toBeNull();
    expect(parseViewPreference("1")).toBeNull();
    expect(parseViewPreference(undefined)).toBeNull();
  });
});

describe("readViewOverride", () => {
  it("识别两个逃生口参数", () => {
    expect(readViewOverride("?desktop=1")).toBe("desktop");
    expect(readViewOverride("?mobile=1")).toBe("mobile");
  });

  it("desktop=1 优先于 mobile=1（同时出现时保守留在桌面版）", () => {
    expect(readViewOverride("?mobile=1&desktop=1")).toBe("desktop");
  });

  it("取值不是 1 或没有参数时不算逃生", () => {
    expect(readViewOverride("?desktop=0")).toBeNull();
    expect(readViewOverride("")).toBeNull();
    expect(readViewOverride("?page=2")).toBeNull();
  });
});

describe("resolveViewDecision", () => {
  const base = { pathname: "/", search: "", userAgent: WINDOWS, viewCookie: undefined };

  it("手机 UA 访问入口路径跳到移动端工作台", () => {
    expect(resolveViewDecision({ ...base, userAgent: IPHONE })).toEqual({
      redirectTo: MOBILE_HOME,
      setView: null,
    });
    expect(
      resolveViewDecision({ ...base, pathname: "/dashboard", userAgent: ANDROID_PHONE }).redirectTo,
    ).toBe(MOBILE_HOME);
  });

  it("桌面 UA 行为完全不变", () => {
    expect(resolveViewDecision(base)).toEqual({ redirectTo: null, setView: null });
  });

  it("深层路由永不改写——分享链接在两端打开的是同一个页面", () => {
    for (const pathname of ["/notes/3/7", "/docs/abc", "/ai/chat/9", "/settings/profile"]) {
      expect(resolveViewDecision({ ...base, pathname, userAgent: IPHONE }).redirectTo).toBeNull();
    }
  });

  it("?desktop=1 是逃生口：不跳转，并把选择写进偏好", () => {
    expect(resolveViewDecision({ ...base, search: "?desktop=1", userAgent: IPHONE })).toEqual({
      redirectTo: null,
      setView: "desktop",
    });
  });

  it("?mobile=1 让桌面浏览器也能进移动版并记住", () => {
    expect(resolveViewDecision({ ...base, search: "?mobile=1" })).toEqual({
      redirectTo: MOBILE_HOME,
      setView: "mobile",
    });
  });

  it("偏好 Cookie 优先于 UA（两个方向都要成立）", () => {
    expect(
      resolveViewDecision({ ...base, userAgent: IPHONE, viewCookie: "desktop" }).redirectTo,
    ).toBeNull();
    expect(resolveViewDecision({ ...base, viewCookie: "mobile" }).redirectTo).toBe(MOBILE_HOME);
  });

  it("逃生口优先于偏好 Cookie", () => {
    expect(resolveViewDecision({ ...base, search: "?mobile=1", viewCookie: "desktop" })).toEqual({
      redirectTo: MOBILE_HOME,
      setView: "mobile",
    });
  });

  it("已经在 /m/* 里不再参与分流，但逃生口仍然记偏好", () => {
    expect(resolveViewDecision({ ...base, pathname: "/m/notes", userAgent: IPHONE })).toEqual({
      redirectTo: null,
      setView: null,
    });
    expect(resolveViewDecision({ ...base, pathname: "/m/me", search: "?desktop=1" })).toEqual({
      redirectTo: null,
      setView: "desktop",
    });
  });

  it("UA 判定不写 Cookie——它每次都能重新算，写了反而固化误判", () => {
    expect(resolveViewDecision({ ...base, userAgent: IPHONE }).setView).toBeNull();
  });

  it("Cookie 名对外是稳定契约", () => {
    expect(VIEW_COOKIE).toBe("anynote_view");
  });
});
