import type { AddressInfo } from "node:net";
import { SignJWT } from "jose";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { COLLAB_TOKEN_AUDIENCE, COLLAB_TOKEN_ISSUER } from "../auth.ts";
import type { CollabConfig } from "../config.ts";
import { createCollabServer } from "../server.ts";

const secret = "a-very-long-dev-secret";
const origin = "http://localhost:3000";

// 端口 0 让内核分配空闲端口，避免与本机其他服务或并行用例抢占。
const config: CollabConfig = {
  host: "127.0.0.1",
  port: 0,
  tokenSecret: secret,
  persistenceDir: null,
  allowedOrigins: [origin],
};

let server: ReturnType<typeof createCollabServer>;
let baseUrl: string;
let wsUrl: string;

function token(subject = "7") {
  return new SignJWT({ name: "甲" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(COLLAB_TOKEN_ISSUER)
    .setAudience(COLLAB_TOKEN_AUDIENCE)
    .setSubject(subject)
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
}

/**
 * 等握手结果：成功 resolve socket + 消息缓冲，失败 resolve 出服务端回的 HTTP 状态码。
 *
 * 消息监听必须在构造时就挂上：服务端的 syncStep1 可能与 `open` 在同一个
 * socket data 回调里派发完，等 await 恢复后再监听就已经错过了。
 */
function handshake(path: string, headers: Record<string, string> = { origin }) {
  return new Promise<{ socket: WebSocket; messages: Uint8Array[] } | { status: number }>(
    (resolve) => {
      const socket = new WebSocket(`${wsUrl}${path}`, { headers });
      const messages: Uint8Array[] = [];
      socket.on("message", (data) => messages.push(new Uint8Array(data as Buffer)));
      socket.on("open", () => resolve({ socket, messages }));
      socket.on("unexpected-response", (_request, response) => {
        socket.terminate();
        resolve({ status: response.statusCode ?? 0 });
      });
      socket.on("error", () => resolve({ status: 0 }));
    },
  );
}

/** 轮询等待条件成立，避免对事件循环调度顺序做硬假设。 */
async function waitFor(predicate: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("等待条件超时");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeAll(async () => {
  server = createCollabServer(config);
  await server.listen();
  const { port } = server.httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  await server.close();
});

describe("HTTP 端点", () => {
  it("/healthz 返回房间数，可作为容器健康检查", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", rooms: expect.any(Number) });
  });

  it("其他路径一律 404", async () => {
    expect((await fetch(`${baseUrl}/`)).status).toBe(404);
  });
});

describe("WebSocket 握手准入", () => {
  it("合法令牌 + 合法来源可以连上", async () => {
    const result = await handshake(`/index?token=${await token()}`);
    expect(result).toHaveProperty("socket");
    if ("socket" in result) result.socket.close();
  });

  it("缺令牌被拒（400）", async () => {
    expect(await handshake("/index")).toEqual({ status: 400 });
  });

  it("房间名非法被拒（400）", async () => {
    expect(await handshake(`/note:1?token=${await token()}`)).toEqual({ status: 400 });
  });

  it("来源不在白名单被拒（403）", async () => {
    const result = await handshake(`/index?token=${await token()}`, {
      origin: "http://evil.example",
    });
    expect(result).toEqual({ status: 403 });
  });

  it("令牌无效被拒（401）", async () => {
    expect(await handshake("/index?token=garbage")).toEqual({ status: 401 });
  });
});

describe("连接生命周期", () => {
  it("连上后服务端立刻推 syncStep1，断开后房间被回收", async () => {
    const result = await handshake(`/doc:lifecycle01?token=${await token()}`);
    expect(result).toHaveProperty("socket");
    if (!("socket" in result)) return;
    const { socket, messages } = result;

    await waitFor(() => messages.length > 0);
    // 第一个字节是消息类型 varUint，0 = sync
    expect(messages[0]?.[0]).toBe(0);
    expect(server.manager.size).toBeGreaterThan(0);

    await new Promise<void>((resolve) => {
      socket.on("close", () => resolve());
      socket.close();
    });
    // 关闭回调里的 closeIfEmpty 是异步的，轮询等它把房间回收掉
    await waitFor(() => server.manager.size === 0);
    expect(server.manager.size).toBe(0);
  });
});

describe("真实 socket 上的双端收敛", () => {
  it("一端发出的 update 经服务端广播后被另一端应用", async () => {
    const room = `/doc:converge01?token=${await token()}`;
    const a = await handshake(room);
    const b = await handshake(room);
    if (!("socket" in a) || !("socket" in b)) throw new Error("握手失败");

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    // 两端各自把收到的 sync 消息喂回自己的文档，等价于 y-websocket provider 的行为。
    const pump = (target: Y.Doc, source: { socket: WebSocket; messages: Uint8Array[] }) => {
      source.socket.on("message", (data) => {
        const decoder = decoding.createDecoder(new Uint8Array(data as Buffer));
        if (decoding.readVarUint(decoder) !== 0) return;
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0);
        syncProtocol.readSyncMessage(decoder, encoder, target, "remote");
        if (encoding.length(encoder) > 1) source.socket.send(encoding.toUint8Array(encoder));
      });
    };
    pump(docA, a);
    pump(docB, b);

    docA.getText("content").insert(0, "协同内容");
    const update = encoding.createEncoder();
    encoding.writeVarUint(update, 0);
    syncProtocol.writeUpdate(update, Y.encodeStateAsUpdate(docA));
    a.socket.send(encoding.toUint8Array(update));

    await waitFor(() => docB.getText("content").toString() === "协同内容");
    expect(docB.getText("content").toString()).toBe("协同内容");

    a.socket.close();
    b.socket.close();
    await waitFor(() => server.manager.size === 0);
  });
});
