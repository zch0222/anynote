import AuthLayout from "@/app/(auth)/layout";
import LoginPage from "@/app/(auth)/login/page";
import RegisterPage from "@/app/(auth)/register/page";
import { renderHookWithProviders } from "@/test/render";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import createClient from "openapi-fetch";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLoginMutation, useRegisterMutation } from "../use-auth-mutation";

const { post, push } = vi.hoisted(() => ({ post: vi.fn(), push: vi.fn() }));
vi.mock("openapi-fetch", () => ({ default: vi.fn(() => ({ POST: post })) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() }, Toaster: () => null }));

const loginInput = { username: "tester01", password: "Password1" };
const registerInput = { ...loginInput, nickname: "测试用户", sex: 0 as const };
function upstream(body: unknown = { code: "00000", data: { nickname: "测试用户" } }, status = 200) {
  return { [status < 400 ? "data" : "error"]: body, response: new Response(null, { status }) };
}

beforeEach(() => {
  post.mockReset();
});

describe.each([
  { path: "/login", hook: () => useLoginMutation(), input: loginInput },
  { path: "/register", hook: () => useRegisterMutation(), input: registerInput },
])("认证 mutation $path", ({ path, hook, input }) => {
  it("只调用同源 BFF 的 typed client，成功结果不缓存用户资料或凭据", async () => {
    post.mockResolvedValue(upstream());
    const { result } = renderHookWithProviders<ReturnType<typeof hook>, unknown>(hook);
    await act(async () => {
      await result.current.mutateAsync(input as typeof registerInput);
    });
    expect(post).toHaveBeenCalledExactlyOnceWith(path, {
      body: input,
      signal: expect.any(AbortSignal),
    });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it.each([
    { body: { code: "A0201", msg: "账号已存在" }, status: 200, message: "账号已存在" },
    { body: { code: "A0301", msg: "请求来源不受信任" }, status: 403, message: "请求来源不受信任" },
    { body: { code: "00000" }, status: 502, message: "认证失败，请稍后重试" },
    { body: null, status: 200, message: "认证服务响应异常，请稍后重试" },
    { body: { code: "B0001" }, status: 200, message: "认证失败，请稍后重试" },
  ])("处理 HTTP $status 与业务错误，禁止自动重试", async ({ body, status, message }) => {
    post.mockResolvedValue(upstream(body, status));
    const { result } = renderHookWithProviders<ReturnType<typeof hook>, unknown>(hook);
    await act(async () => {
      await expect(result.current.mutateAsync(input as typeof registerInput)).rejects.toThrow(
        message,
      );
    });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("网络失败提供可展示消息，不暴露底层异常", async () => {
    post.mockRejectedValue(new Error("internal detail"));
    const { result } = renderHookWithProviders<ReturnType<typeof hook>, unknown>(hook);
    await act(async () => {
      await expect(result.current.mutateAsync(input as typeof registerInput)).rejects.toThrow(
        "网络连接失败，请稍后重试",
      );
    });
    expect(post).toHaveBeenCalledTimes(1);
  });
});

it("客户端固定同源地址与 Cookie 策略", async () => {
  vi.resetModules();
  await import("../use-auth-mutation");
  expect(createClient).toHaveBeenCalledWith({ baseUrl: "/api/auth", credentials: "same-origin" });
});

describe.each([
  { label: "登录", Page: LoginPage, submitLabel: "登录", path: "/login" },
  { label: "注册", Page: RegisterPage, submitLabel: "注册并登录", path: "/register" },
])("$label 页面", ({ label, Page, submitLabel, path }) => {
  function show() {
    render(
      <AuthLayout>
        <Page />
      </AuthLayout>,
    );
  }
  function fill() {
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "tester01" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "Password1" } });
  }

  it("显示字段错误并阻止无效提交", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: submitLabel }));
    await waitFor(() =>
      expect(screen.getByLabelText("用户名")).toHaveAttribute("aria-invalid", "true"),
    );
    expect(screen.getByLabelText("密码")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(2);
    expect(post).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("提交期间禁用按钮，成功后跳转 dashboard", async () => {
    let resolve!: (value: ReturnType<typeof upstream>) => void;
    post.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name: submitLabel }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const pending = screen.getByRole("button", { name: `${label}中…` });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toBe(path);
    await act(async () => {
      resolve(upstream());
    });
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/dashboard"));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("业务失败显示 sonner 错误并可重试，保持当前页面", async () => {
    post.mockResolvedValue(upstream({ code: "A0201", msg: "认证未通过" }));
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name: submitLabel }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("认证未通过"));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: submitLabel })).toBeEnabled();
    post.mockResolvedValue(upstream());
    fireEvent.click(screen.getByRole("button", { name: submitLabel }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("提供登录和注册页之间的链接", () => {
    show();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      path === "/login" ? "/register" : "/login",
    );
  });
});

it("注册发送昵称、可选邮箱以及后端约定的性别值（0 男 / 1 女）", async () => {
  post.mockResolvedValue(upstream());
  render(
    <AuthLayout>
      <RegisterPage />
    </AuthLayout>,
  );
  expect(screen.getByRole("option", { name: "男" })).toHaveValue("0");
  expect(screen.getByRole("option", { name: "女" })).toHaveValue("1");
  for (const [label, value] of [
    ["用户名", "tester01"],
    ["密码", "Password1"],
    ["昵称", "测试用户"],
    ["邮箱（选填）", "test@example.com"],
    ["性别", "1"],
  ] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole("button", { name: "注册并登录" }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledExactlyOnceWith("/register", {
      body: { ...registerInput, email: "test@example.com", sex: 1 },
      signal: expect.any(AbortSignal),
    }),
  );
});
