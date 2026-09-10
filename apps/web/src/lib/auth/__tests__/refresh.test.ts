// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshWithLock } from "../refresh";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("openapi-fetch", () => ({ default: vi.fn(() => ({ POST: post })) }));
vi.mock("@/lib/env", () => ({
  env: {
    INTERNAL_API_URL: "http://gateway:8080/",
    NEXT_PUBLIC_APP_URL: "https://notes.example.com",
  },
}));

const token = { accessToken: "new-access", refreshToken: "new-refresh" };

function envelope(data: unknown, code = "00000", status = 200) {
  const response = new Response(null, { status });
  return status < 400
    ? { data: { code, msg: "操作成功", data }, response }
    : { error: { code: "A0311", msg: "失效" }, response };
}

beforeEach(() => {
  post.mockReset();
});

describe("refreshWithLock 单飞刷新", () => {
  it("并发同 rt 只打一次后端，共享同一结果", async () => {
    let release: (value: ReturnType<typeof envelope>) => void = () => {};
    post.mockReturnValueOnce(
      new Promise((resolve) => {
        release = () => resolve(envelope(token));
      }),
    );

    const first = refreshWithLock("rt-old");
    const second = refreshWithLock("rt-old");
    release(envelope(token));
    const [a, b] = await Promise.all([first, second]);

    expect(post).toHaveBeenCalledExactlyOnceWith("/refresh", {
      body: { refreshToken: "rt-old" },
      signal: expect.any(AbortSignal),
    });
    expect(a).toEqual({ ok: true, token });
    expect(b).toEqual({ ok: true, token });
    expect(a).toBe(b);
  });

  it("不同 rt 各自调用后端", async () => {
    post.mockResolvedValue(envelope(token));
    await Promise.all([refreshWithLock("rt-a"), refreshWithLock("rt-b")]);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("失败后释放锁，重试会再次调用后端", async () => {
    post.mockResolvedValueOnce(envelope(null, "A0311", 401));
    const failed = await refreshWithLock("rt-retry");
    expect(failed).toMatchObject({ ok: false });
    expect(failed.ok === false && failed.response.status).toBe(401);

    post.mockResolvedValueOnce(envelope(token));
    const retried = await refreshWithLock("rt-retry");
    expect(retried).toEqual({ ok: true, token });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("Token 形状不完整按上游不可用处理", async () => {
    post.mockResolvedValue(envelope({ accessToken: "only-access" }));
    const outcome = await refreshWithLock("rt-bad");
    expect(outcome).toMatchObject({ ok: false });
    expect(outcome.ok === false && outcome.response.status).toBe(502);
  });
});
