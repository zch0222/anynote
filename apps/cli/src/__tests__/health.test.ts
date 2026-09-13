import { describe, expect, it } from "vitest";
import { GATEWAY_HEALTH_PATH, probeGateway } from "../core/health";

/**
 * `doctor` 的网关探针回归护栏。
 *
 * 背景（真实踩坑）：把 api-url 误设成 Web 前端地址时，前端对未知路径回
 * 307 → /login → 200 HTML，而旧实现只判断 `response.ok`，于是 doctor 报 `UP`，
 * 用户却在下一条命令上撞 404。探针必须能识别"这不是网关"。
 */

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/vnd.spring-boot.actuator.v3+json" },
  });
}

describe("probeGateway", () => {
  it("正常的 actuator 响应报 UP，并打在 apiUrl 的 /actuator/health 上", async () => {
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      seen.push(typeof input === "string" ? input : (input as Request).url);
      return jsonResponse({ status: "UP" });
    };

    await expect(probeGateway("http://gw.test", fetchImpl)).resolves.toBe("UP");
    expect(seen).toEqual([`http://gw.test${GATEWAY_HEALTH_PATH}`]);
  });

  it("apiUrl 末尾有斜杠也不会拼出双斜杠", async () => {
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      seen.push(typeof input === "string" ? input : (input as Request).url);
      return jsonResponse({ status: "UP" });
    };

    await probeGateway("http://gw.test///", fetchImpl);
    expect(seen).toEqual([`http://gw.test${GATEWAY_HEALTH_PATH}`]);
  });

  it("探针必须禁止跟随重定向，否则前端的 307 → /login 会被跟成 200", async () => {
    let redirectMode: RequestRedirect | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      redirectMode = init?.redirect;
      return new Response(null, { status: 307, headers: { location: "/login" } });
    };

    await probeGateway("http://web.test", fetchImpl);
    expect(redirectMode).toBe("manual");
  });

  it("3xx 重定向不报 UP，并指出被重定向到哪（这是 Web 前端不是网关）", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(null, { status: 307, headers: { location: "/login" } });

    const status = await probeGateway("http://web.test", fetchImpl);
    expect(status).not.toBe("UP");
    expect(status).toContain("307");
    expect(status).toContain("/login");
  });

  it("200 HTML 登录页不报 UP", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("<!DOCTYPE html><html><body>登录</body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });

    const status = await probeGateway("http://web.test", fetchImpl);
    expect(status).not.toBe("UP");
    // 消息要能直接指向病因：这是个网页，不是网关
    expect(status).toContain("不是网关");
    expect(status).toContain("text/html");
  });

  it("200 但 JSON 里没有 status 字段时也不报 UP", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({ hello: "world" });
    const status = await probeGateway("http://web.test", fetchImpl);
    expect(status).not.toBe("UP");
    expect(status).toContain("status");
  });

  it("非 2xx 报出 HTTP 状态码", async () => {
    const fetchImpl: typeof fetch = async () => new Response("nope", { status: 404 });
    await expect(probeGateway("http://gw.test", fetchImpl)).resolves.toBe("HTTP 404");
  });

  it("连不上时给出 unreachable 前缀，供调用方与用户区分", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    };
    const status = await probeGateway("http://127.0.0.1:59999", fetchImpl);
    expect(status).toMatch(/^unreachable: /);
  });

  it("actuator 报 DOWN 时原样透传，不美化成 UP", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({ status: "DOWN" }, 503);
    // 503 属于非 2xx，先走 HTTP 分支——这里钉住"绝不返回 UP"
    await expect(probeGateway("http://gw.test", fetchImpl)).resolves.toBe("HTTP 503");
  });
});
