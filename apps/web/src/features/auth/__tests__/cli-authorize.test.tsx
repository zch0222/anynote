import CliAuthorizePage from "@/app/(auth)/cli/authorize/page";
import { AccountBadge, displayName } from "@/features/auth/components/account-badge";
import { CliAuthorize } from "@/features/auth/components/cli-authorize";
import { renderWithProviders } from "@/test/render";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock, push, replace, assign, toastError, redirectMock, cookiesGet } = vi.hoisted(
  () => ({
    fetchMock: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    assign: vi.fn(),
    toastError: vi.fn(),
    cookiesGet: vi.fn(),
    redirectMock: vi.fn((target: string) => {
      // Next 的 redirect 通过抛异常中断渲染，这里照搬该行为
      throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${target}` });
    }),
  }),
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(),
  redirect: redirectMock,
}));
vi.mock("sonner", () => ({ toast: { error: toastError }, Toaster: () => null }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookiesGet }) }));

const params = { port: 51234, state: "st-ate", challenge: "ch-allenge" };

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ code: status < 400 ? "00000" : "A0311", msg: "m", data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", { assign });
  cookiesGet.mockReturnValue({ value: "at-1" });
});

describe("displayName", () => {
  it("昵称优先，其次用户名，最后占位符", () => {
    expect(displayName({ nickname: "小爱", username: "alice" })).toBe("小爱");
    expect(displayName({ nickname: "  ", username: "alice" })).toBe("alice");
    expect(displayName({ nickname: null, username: null })).toBe("当前账号");
    expect(displayName({})).toBe("当前账号");
  });
});

describe("AccountBadge", () => {
  it("加载中不渲染授权按钮（避免在身份未知时就授权）", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<AccountBadge />);
    expect(screen.getByText("正在读取当前账号…")).toBeInTheDocument();
  });

  it("展示昵称与用户名", async () => {
    fetchMock.mockResolvedValue(envelope({ id: 1, username: "alice", nickname: "小爱" }));
    renderWithProviders(<AccountBadge />);
    await waitFor(() => expect(screen.getByText("小爱")).toBeInTheDocument());
    expect(screen.getByText("@alice")).toBeInTheDocument();
  });

  it("读取失败时给出可操作提示", async () => {
    fetchMock.mockResolvedValue(envelope(null, 502));
    renderWithProviders(<AccountBadge />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("无法读取当前账号"));
  });
});

describe("CliAuthorize 组件", () => {
  it("展示授权说明与账号，未点击前不发任何请求（用户手势是硬要求）", async () => {
    fetchMock.mockResolvedValue(envelope({ id: 1, username: "alice", nickname: "小爱" }));
    renderWithProviders(<CliAuthorize params={params} />);

    expect(screen.getByRole("heading", { name: "授权 CLI 登录" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("小爱")).toBeInTheDocument());
    // 只有 /api/auth/me 这一次读取，没有 cli-token
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/auth/me");
    expect(push).not.toHaveBeenCalled();
  });

  /** D-15 图例 2：`**独立的**` 曾被原样渲染成字面星号。 */
  it("说明里不出现字面星号，「独立的」用加粗元素渲染", async () => {
    fetchMock.mockResolvedValue(envelope({ id: 1, username: "alice" }));
    renderWithProviders(<CliAuthorize params={params} />);

    const body = document.body.textContent ?? "";
    expect(body).not.toContain("**");
    expect(body).toContain("独立的");

    const strong = screen.getByText("独立的");
    expect(strong.tagName).toBe("STRONG");
  });

  /** D-15 图例 4：端口必须显示，用户才能和终端里的地址核对。 */
  it("显示回调端口，与链接参数一致", async () => {
    fetchMock.mockResolvedValue(envelope({ id: 1, username: "alice" }));
    renderWithProviders(<CliAuthorize params={{ ...params, port: 53817 }} />);

    expect(screen.getByText("回调到本机 127.0.0.1:53817")).toBeInTheDocument();
  });

  /** D-15 图例 7：安全说明换成把 PKCE 讲成人话的版本。 */
  it("安全说明不再说「地址栏以外」那套开发者语言", async () => {
    fetchMock.mockResolvedValue(envelope({ id: 1, username: "alice" }));
    renderWithProviders(<CliAuthorize params={params} />);

    const body = document.body.textContent ?? "";
    expect(body).toContain("60 秒内有效");
    expect(body).toContain("必须配合 CLI 私有的校验码才能兑换");
    expect(body).not.toContain("不会出现在浏览器地址栏以外的任何地方");
  });

  it("点击授权后把参数提交给 BFF 并整页跳到回环地址", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/me") return envelope({ id: 1, username: "alice" });
      return envelope({
        code: "the-code",
        state: params.state,
        redirectTo: `http://127.0.0.1:${params.port}/callback?code=the-code&state=${params.state}`,
      });
    });

    renderWithProviders(<CliAuthorize params={params} />);
    await waitFor(() => expect(screen.getByText("@alice")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "授权" }));
    });

    const call = fetchMock.mock.calls.find(([url]) => url === "/api/auth/cli-token");
    expect(call).toBeDefined();
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      port: params.port,
      state: params.state,
      codeChallenge: params.challenge,
    });
    // 必须整页导航（目标是 CLI 的回环服务，不是 Next 路由）
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        `http://127.0.0.1:${params.port}/callback?code=the-code&state=${params.state}`,
      ),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("授权失败时提示错误且不跳转", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/me") return envelope({ id: 1, username: "alice" });
      return new Response(JSON.stringify({ code: "A0311", msg: "登录状态已过期，请重新登录" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    });

    renderWithProviders(<CliAuthorize params={params} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "授权" }));
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("登录状态已过期，请重新登录"));
    expect(assign).not.toHaveBeenCalled();
  });

  it("提交期间禁用按钮，避免重复签发授权码", async () => {
    let resolveAuthorize!: (value: Response) => void;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/me") return envelope({ id: 1, username: "alice" });
      return new Promise<Response>((resolve) => {
        resolveAuthorize = resolve;
      });
    });

    renderWithProviders(<CliAuthorize params={params} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "授权" }));
    });

    const pending = await screen.findByRole("button", { name: "授权中…" });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/auth/cli-token")).toHaveLength(1);

    await act(async () => {
      resolveAuthorize(
        envelope({ code: "c", state: params.state, redirectTo: "http://127.0.0.1:1/cb" }),
      );
    });
  });

  it("取消按钮回工作台，不发起授权", async () => {
    fetchMock.mockResolvedValue(envelope({ id: 1, username: "alice" }));
    renderWithProviders(<CliAuthorize params={params} />);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(push).toHaveBeenCalledWith("/dashboard");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("授权页 RSC", () => {
  async function show(search: string) {
    return CliAuthorizePage({
      searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(search))),
    });
  }

  it("参数非法时渲染可读错误，不跳登录、不渲染授权按钮", async () => {
    render(await show("port=80&state=s&challenge=c"));
    expect(screen.getByRole("heading", { name: "授权链接无效" })).toBeInTheDocument();
    // 文案表：{原因}。请在终端重新执行 anynote auth login。
    expect(screen.getByText(/port 必须在 1024-65535 之间。请在终端重新执行/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "授权" })).not.toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("缺少 challenge 时同样报错，提示重新执行命令", async () => {
    render(await show("port=51234&state=s"));
    expect(screen.getByText(/缺少 challenge/)).toBeInTheDocument();
    expect(screen.getByText(/anynote auth login/)).toBeInTheDocument();
  });

  it("未登录时跳到登录页，并把完整授权参数带进 next", async () => {
    cookiesGet.mockReturnValue(undefined);
    await expect(show("port=51234&state=s&challenge=c")).rejects.toThrow("NEXT_REDIRECT");

    const target = String(redirectMock.mock.calls[0]?.[0] ?? "");
    expect(target.startsWith("/login?next=")).toBe(true);
    const decoded = decodeURIComponent(target.slice("/login?next=".length));
    const parsed = new URL(`http://x.test${decoded}`);
    expect(parsed.pathname).toBe("/cli/authorize");
    expect(parsed.searchParams.get("port")).toBe("51234");
    expect(parsed.searchParams.get("state")).toBe("s");
    expect(parsed.searchParams.get("challenge")).toBe("c");
  });

  it("已登录时渲染授权界面", async () => {
    fetchMock.mockResolvedValue(envelope({ id: 1, username: "alice" }));
    renderWithProviders(await show("port=51234&state=s&challenge=c"));
    expect(screen.getByRole("heading", { name: "授权 CLI 登录" })).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
