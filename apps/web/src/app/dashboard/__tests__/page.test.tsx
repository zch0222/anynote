import DashboardPage from "@/app/dashboard/page";
import { renderWithProviders } from "@/test/render";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

const fetchMock = vi.fn();
const profile = { id: 7, username: "tester01", nickname: "测试用户", avatar: null, role: null };

function envelope(data: unknown, code = "00000", status = 200) {
  return new Response(JSON.stringify({ code, msg: "操作成功", data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  replace.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("dashboard 雏形页", () => {
  it("useMe 成功后渲染昵称", async () => {
    fetchMock.mockResolvedValue(envelope(profile));
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByRole("heading", { name: "欢迎回来，测试用户" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("会话失效（BFF 刷新后仍 401）回退到登录页", async () => {
    fetchMock.mockResolvedValue(envelope(null, "A0311", 401));
    renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith("/login"));
  });

  it("非 401 失败停留原地展示错误", async () => {
    fetchMock.mockResolvedValue(envelope(null, "B0400", 502));
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText("加载用户信息失败，请稍后重试")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
