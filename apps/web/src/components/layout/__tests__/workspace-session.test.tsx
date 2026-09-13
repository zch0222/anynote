import { WorkspaceSession } from "@/components/layout/workspace-session";
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

/**
 * `WorkspaceSession` 是两个外壳（桌面 `AppShell` / 移动 `MobileShell`）共用的
 * 会话闸门，所以它的三条分支在这里独立钉住，不再借某个具体页面来间接覆盖。
 */
describe("WorkspaceSession 会话闸门", () => {
  it("useMe 成功后放行子内容", async () => {
    fetchMock.mockResolvedValue(envelope(profile));
    renderWithProviders(
      <WorkspaceSession>
        <h1>私有页面</h1>
      </WorkspaceSession>,
    );

    expect(await screen.findByRole("heading", { name: "私有页面" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("加载中先给可读的占位，不闪空白", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderWithProviders(
      <WorkspaceSession>
        <h1>私有页面</h1>
      </WorkspaceSession>,
    );

    expect(screen.queryByRole("heading", { name: "私有页面" })).not.toBeInTheDocument();
    expect(screen.getByText("正在加载工作区")).toBeInTheDocument();
  });

  it("会话失效（BFF 刷新后仍 401）回退到登录页", async () => {
    fetchMock.mockResolvedValue(envelope(null, "A0311", 401));
    renderWithProviders(
      <WorkspaceSession>
        <h1>私有页面</h1>
      </WorkspaceSession>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith("/login"));
  });

  it("非 401 失败停留原地展示错误并可重试", async () => {
    fetchMock.mockResolvedValue(envelope(null, "B0400", 502));
    renderWithProviders(
      <WorkspaceSession>
        <h1>私有页面</h1>
      </WorkspaceSession>,
    );

    expect(await screen.findByText("加载用户信息失败，请稍后重试")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
