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

  it("加载中给品牌启动（不是两块灰条 + 一行裸文字），且读屏播报得到", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderWithProviders(
      <WorkspaceSession>
        <h1>私有页面</h1>
      </WorkspaceSession>,
    );

    // 会话未知 = 真正的「全屏初始化」，设计稿 P16 指定的唯一形态
    expect(screen.queryByRole("heading", { name: "私有页面" })).not.toBeInTheDocument();
    // BrandBoot 自己带 120ms 的防抖（快速请求不该闪一下启动页），所以要等它出现
    const boot = await screen.findByRole("status", {}, { timeout: 2000 });
    expect(boot.textContent).toContain("正在准备工作区");
    // 品牌三件套里的 Logo 必须在
    expect(document.querySelector('[data-slot="brand-logo"]')).not.toBeNull();
    // 旧的裸骨架不该再出现
    expect(document.querySelector('[data-slot="skeleton"]')).toBeNull();
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
