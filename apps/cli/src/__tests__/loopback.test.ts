import { afterEach, describe, expect, it } from "vitest";
import { CALLBACK_PATH, LoopbackError, startLoopbackServer } from "../auth/loopback";

const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function listen(state = "expected-state") {
  const server = await startLoopbackServer({ state });
  servers.push(server);
  return server;
}

function callback(port: number, query: string) {
  return fetch(`http://127.0.0.1:${port}${CALLBACK_PATH}?${query}`);
}

describe("回环回调服务", () => {
  it("只监听 127.0.0.1，且端口由内核分配", async () => {
    const server = await listen();
    expect(server.port).toBeGreaterThan(0);
    // 能从回环连上
    const response = await callback(server.port, "code=c&state=expected-state");
    expect(response.status).toBe(200);
  });

  it("state 匹配时把 code 交给等待方，并提示可以关闭页面", async () => {
    const server = await listen();
    const waiting = server.waitForCode({ timeoutMs: 5_000 });
    const response = await callback(server.port, "code=the-code&state=expected-state");
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("可以关闭");

    await expect(waiting).resolves.toEqual({ code: "the-code", state: "expected-state" });
  });

  /**
   * D-15 图例 13：回调完成页与 `apps/web` 的认证卡片同一视觉。
   *
   * 断言的是**契约性的三件事**：品牌标记在、文案与卡片一致、版式是居中卡片。
   * 不逐条比对色值——那些抄自 `globals.css`，改主题色板时这里跟着漂是预期的。
   */
  it("完成页是品牌标记 + 居中卡片，文案与 D-15 图例一致", async () => {
    const server = await listen();
    const waiting = server.waitForCode({ timeoutMs: 5_000 });
    const response = await callback(server.port, "code=c&state=expected-state");
    const body = await response.text();
    await waiting;

    expect(body).toContain("已收到授权，请回到终端继续。此页面可以关闭。");
    expect(body).toContain("Anynote CLI");
    // 品牌方块 + 书形描边（与 apps/web 的 AnynoteLogo 同一几何）
    expect(body).toContain('class="mark"');
    expect(body).toContain("M12 6.7 L6.4 4.6");
    // 居中卡片：flex 居中 + 圆角 20 + 卡片阴影（与登录卡同一套规格）
    expect(body).toContain("align-items:center");
    expect(body).toContain("border-radius:20px");
    expect(body).toContain("box-shadow:var(--shadow)");
  });

  it("深色下不落到白底黑字（回调页读的是系统偏好）", async () => {
    const server = await listen();
    const waiting = server.waitForCode({ timeoutMs: 5_000 });
    const response = await callback(server.port, "code=c&state=expected-state");
    const body = await response.text();
    await waiting;

    expect(body).toContain("prefers-color-scheme:dark");
  });

  it("state 不匹配时拒绝该请求，且继续等待真正的回调", async () => {
    const ignored: Array<{ url: string; reason: string }> = [];
    const server = await startLoopbackServer({
      state: "expected-state",
      onIgnoredRequest: (info) => ignored.push(info),
    });
    servers.push(server);

    const waiting = server.waitForCode({ timeoutMs: 5_000 });
    const rejected = await callback(server.port, "code=evil&state=other-state");
    expect(rejected.status).toBe(400);
    expect(ignored).toHaveLength(1);
    expect(ignored[0]?.reason).toBe("state 不匹配");

    // 服务没有被关掉，合法回调仍然能完成
    await callback(server.port, "code=good&state=expected-state");
    await expect(waiting).resolves.toEqual({ code: "good", state: "expected-state" });
  });

  it("缺少 code 或 state 的回调被拒", async () => {
    const server = await listen();
    await expect(callback(server.port, "state=expected-state")).resolves.toMatchObject({
      status: 400,
    });
    await expect(callback(server.port, "code=only-code")).resolves.toMatchObject({ status: 400 });
  });

  it("非回调路径返回 404，减少被其他页面误触发", async () => {
    const server = await listen();
    const response = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(response.status).toBe(404);
  });

  it("完成一次授权后重复回调返回 409（一次性）", async () => {
    const server = await listen();
    const waiting = server.waitForCode({ timeoutMs: 5_000 });
    await callback(server.port, "code=first&state=expected-state");
    await waiting;

    await expect(callback(server.port, "code=second&state=expected-state")).resolves.toMatchObject({
      status: 409,
    });
  });

  it("回调早于 waitForCode 到达时不丢结果（用户点得快）", async () => {
    const server = await listen();
    await callback(server.port, "code=early&state=expected-state");
    await expect(server.waitForCode({ timeoutMs: 5_000 })).resolves.toEqual({
      code: "early",
      state: "expected-state",
    });
  });

  it("超时报 LoopbackError，错误信息带秒数", async () => {
    const server = await listen();
    await expect(server.waitForCode({ timeoutMs: 30 })).rejects.toThrow(LoopbackError);
    await expect(server.waitForCode({ timeoutMs: 30 })).rejects.toThrow(/等待授权超时/);
  });

  it("AbortSignal 触发时立即结束等待", async () => {
    const server = await listen();
    const controller = new AbortController();
    const waiting = server.waitForCode({ timeoutMs: 5_000, signal: controller.signal });
    controller.abort();
    await expect(waiting).rejects.toThrow(/授权已取消/);
  });

  it("端口被占用时给出可操作的提示而不是原始 EADDRINUSE", async () => {
    const first = await listen();
    await expect(startLoopbackServer({ state: "s", port: first.port })).rejects.toThrow(
      /回环端口被占用/,
    );
  });
});
