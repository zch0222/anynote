import HomePage from "@/app/page";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesGet, redirectMock } = vi.hoisted(() => ({
  cookiesGet: vi.fn(),
  redirectMock: vi.fn((target: string) => {
    // Next 的 redirect 通过抛异常中断渲染，这里照搬该行为（同 cli-authorize.test.tsx）
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${target}` });
  }),
}));

// 首页是纯服务端组件，渲染结果就是 LandingPage；mock 掉避免拖整棵落地页组件树进单测
vi.mock("@/features/landing/components/landing-page", () => ({
  LandingPage: () => <div data-testid="landing" />,
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookiesGet }) }));

beforeEach(() => {
  vi.clearAllMocks();
  cookiesGet.mockReturnValue(undefined);
});

/**
 * 首页「已登录就跳工作台」的判据必须与 middleware 同口径（`at` **或** `rt`）：
 * `at` 过期被浏览器删除、`rt` 仍有效时，用户刷新首页不该被当成访客留在官网，
 * 那正是「刷新之后登录状态丢了」的另一种表现（见 middleware.test.ts 同名用例组）。
 */
describe("首页对「可能已登录」的判定（与 middleware 同口径）", () => {
  it("带 at 时跳 /dashboard", async () => {
    cookiesGet.mockImplementation((name: string) =>
      name === "at" ? { value: "access-token" } : undefined,
    );
    await expect(HomePage()).rejects.toMatchObject({ digest: "NEXT_REDIRECT;/dashboard" });
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("仅剩 rt（at 过期被浏览器删除）时同样跳 /dashboard", async () => {
    cookiesGet.mockImplementation((name: string) =>
      name === "rt" ? { value: "refresh-token" } : undefined,
    );
    await expect(HomePage()).rejects.toMatchObject({ digest: "NEXT_REDIRECT;/dashboard" });
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("at 与 rt 都没有时渲染官网首页，不跳转", async () => {
    const result = await HomePage();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
