import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUTES,
  DEFAULT_THRESHOLDS,
  MOBILE_ROUTES,
  MOBILE_THRESHOLDS,
  cookieHeaderFromState,
  evaluateScores,
  formatScore,
  parseArgs,
  selectProfile,
} from "../lighthouse.mjs";

describe("parseArgs", () => {
  it("默认既不指定 URL 也不强制门禁", () => {
    expect(parseArgs([])).toEqual({ urls: [], enforce: false, mobile: false });
  });

  it("--budget 打开门禁", () => {
    expect(parseArgs(["--budget"]).enforce).toBe(true);
  });

  it("可重复 --url 指定多个目标", () => {
    expect(parseArgs(["--url", "http://a/", "--url", "http://b/"]).urls).toEqual([
      "http://a/",
      "http://b/",
    ]);
  });

  it("--url 后面缺值时忽略，不会把下一个开关吃成 URL", () => {
    expect(parseArgs(["--url"]).urls).toEqual([]);
    expect(parseArgs(["--url", "--budget"])).toEqual({
      urls: ["--budget"],
      enforce: false,
      mobile: false,
    });
  });
});

describe("cookieHeaderFromState", () => {
  const state = {
    cookies: [
      { name: "at", value: "access", domain: "localhost" },
      { name: "rt", value: "refresh", domain: "localhost" },
    ],
  };

  it("拼成可直接当请求头用的 Cookie 串", () => {
    expect(cookieHeaderFromState(state, "http://localhost:3000")).toBe("at=access; rt=refresh");
  });

  it("过滤掉其他域的 Cookie（别把无关凭据发出去）", () => {
    const mixed = {
      cookies: [...state.cookies, { name: "x", value: "1", domain: "evil.example" }],
    };
    expect(cookieHeaderFromState(mixed, "http://localhost:3000")).toBe("at=access; rt=refresh");
  });

  it("兼容带前导点的 domain 写法", () => {
    const dotted = { cookies: [{ name: "at", value: "a", domain: ".localhost" }] };
    expect(cookieHeaderFromState(dotted, "http://localhost:3000")).toBe("at=a");
  });

  it("没有可用 Cookie 时返回 null，调用方据此提示会被重定向", () => {
    expect(cookieHeaderFromState({ cookies: [] }, "http://localhost:3000")).toBeNull();
    expect(cookieHeaderFromState(null, "http://localhost:3000")).toBeNull();
    expect(cookieHeaderFromState({ cookies: [{ name: "", value: "x" }] }, "http://x")).toBeNull();
  });

  it("origin 非法时不抛错（退化成不按域过滤）", () => {
    expect(() => cookieHeaderFromState(state, "not-a-url")).not.toThrow();
  });
});

describe("evaluateScores", () => {
  const passing = [{ url: "/login", scores: { performance: 1, accessibility: 1 } }];

  it("全部达标时整体通过", () => {
    const verdict = evaluateScores(passing);
    expect(verdict.pass).toBe(true);
    expect(verdict.checks).toHaveLength(2);
  });

  it("任一项未达标即整体失败，并指出是哪条 URL 的哪一项", () => {
    const verdict = evaluateScores([
      ...passing,
      { url: "/dashboard", scores: { performance: 0.77, accessibility: 1 } },
    ]);
    expect(verdict.pass).toBe(false);
    const failed = verdict.checks.filter((check) => !check.pass);
    expect(failed).toEqual([
      { url: "/dashboard", category: "performance", score: 0.77, threshold: 0.9, pass: false },
    ]);
  });

  it("分数缺失按 0 计——「没跑出来」不能算通过", () => {
    const verdict = evaluateScores([{ url: "/x", scores: {} }]);
    expect(verdict.pass).toBe(false);
    expect(verdict.checks.every((check) => check.score === 0)).toBe(true);
  });

  it("正好等于门槛算通过", () => {
    const verdict = evaluateScores([
      { url: "/x", scores: { performance: 0.9, accessibility: 0.95 } },
    ]);
    expect(verdict.pass).toBe(true);
  });

  it("门槛值与 M8.3 里程碑一致", () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ performance: 0.9, accessibility: 0.95 });
  });

  it("默认路由覆盖公开页与业务页", () => {
    expect(DEFAULT_ROUTES).toContain("/login");
    expect(DEFAULT_ROUTES).toContain("/dashboard");
    expect(DEFAULT_ROUTES.length).toBeGreaterThanOrEqual(2);
  });
});

describe("formatScore", () => {
  it("按百分制取整并右对齐", () => {
    expect(formatScore(1)).toBe("100");
    expect(formatScore(0.9)).toBe(" 90");
    expect(formatScore(0)).toBe("  0");
  });
});

describe("--mobile 与 selectProfile（M10.0）", () => {
  it("--mobile 打开移动口径", () => {
    expect(parseArgs(["--mobile"]).mobile).toBe(true);
    expect(parseArgs(["--budget", "--mobile"])).toEqual({
      urls: [],
      enforce: true,
      mobile: true,
    });
  });

  it("桌面口径用桌面阈值与桌面路由，并加载 desktop-config", () => {
    const profile = selectProfile(false);
    expect(profile.name).toBe("desktop");
    expect(profile.thresholds).toEqual(DEFAULT_THRESHOLDS);
    expect(profile.routes).toEqual(DEFAULT_ROUTES);
    expect(profile.useDesktopConfig).toBe(true);
  });

  it("移动口径换阈值与 /m/* 路由，且不加载 desktop-config", () => {
    const profile = selectProfile(true);
    expect(profile.name).toBe("mobile");
    expect(profile.thresholds).toEqual(MOBILE_THRESHOLDS);
    expect(profile.routes).toEqual(MOBILE_ROUTES);
    // 移动 form factor 下再叠桌面预设，量出来的是「移动页面跑在桌面网络上」的假分数
    expect(profile.useDesktopConfig).toBe(false);
  });

  it("移动端 Performance 门槛 0.85，Accessibility 不降", () => {
    expect(MOBILE_THRESHOLDS.performance).toBe(0.85);
    expect(MOBILE_THRESHOLDS.accessibility).toBe(DEFAULT_THRESHOLDS.accessibility);
  });

  it("移动端默认路由是公开页 + 四条 /m/* 业务页", () => {
    expect(MOBILE_ROUTES[0]).toBe("/login");
    expect(MOBILE_ROUTES.slice(1).every((route) => route.startsWith("/m/"))).toBe(true);
    expect(MOBILE_ROUTES).toContain("/m/dashboard");
  });

  it("按移动阈值判分：0.86 过 Performance，0.84 不过", () => {
    const verdict = evaluateScores(
      [
        { url: "/a", scores: { performance: 0.86, accessibility: 0.96 } },
        { url: "/b", scores: { performance: 0.84, accessibility: 0.96 } },
      ],
      MOBILE_THRESHOLDS,
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.checks.filter((check) => check.pass)).toHaveLength(3);
  });
});
