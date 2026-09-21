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

/** 默认签一枚绑定 note:42 的令牌；room 传 null 表示「不写 room claim」。 */
function token(claims: { room?: string | null; ro?: boolean } = {}, subject = "7") {
  const payload: Record<string, unknown> = { name: "甲" };
  if (claims.room !== null) payload.room = claims.room ?? "note:42";
  if (claims.ro !== undefined) payload.ro = claims.ro;
  return new SignJWT(payload)
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
 * socket data 回调里派发。
 */
function handshake(
  path: string,
  headers: Record<string, string> = { origin },
): Promise<{ socket: WebSocket; messages: Uint8Array[] } | { status: number }> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`${wsUrl}${path}`, { headers });
    const messages: Uint8Array[] = [];
    socket.on("message", (data) => messages.push(new Uint8Array(data as Buffer)));
    socket.on("open", () => resolve({ socket, messages }));
    socket.on("unexpected-response", (_request, response) => {
      socket.terminate();
      resolve({ status: response.statusCode ?? 0 });
    });
    socket.on("error", () => resolve({ status: 0 }));
  });
}

/** 轮询等待条件成立，避免对事件循环调度顺序做硬假设。 */
async function waitFor(predicate: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("等待条件超时");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * 把一个裸 WebSocket 包装成 y-websocket provider 的行为：
 * 1. 连上立刻发一次 syncStep1 索取服务端状态（对应 provider 的 `_onopen`）；
 * 2. 收到 sync 消息就喂进本地 Y.Doc，并按协议回一条（收到 step1 会回 step2）。
 */
function pump(target: Y.Doc, source: { socket: WebSocket }) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeSyncStep1(encoder, target);
  source.socket.send(encoding.toUint8Array(encoder));

  source.socket.on("message", (data) => {
    const decoder = decoding.createDecoder(new Uint8Array(data as Buffer));
    if (decoding.readVarUint(decoder) !== 0) return;
    const reply = encoding.createEncoder();
    encoding.writeVarUint(reply, 0);
    syncProtocol.readSyncMessage(decoder, reply, target, "remote");
    if (encoding.length(reply) > 1) source.socket.send(encoding.toUint8Array(reply));
  });
}

/** 把本地 Y.Doc 的一次 update 编码成协议消息发出去。 */
function sendUpdate(socket: WebSocket, doc: Y.Doc) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(doc));
  socket.send(encoding.toUint8Array(encoder));
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
  it("/healthz 返回房间数与被拒写入数，可作为容器健康检查", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      rooms: expect.any(Number),
      rejectedWrites: expect.any(Number),
    });
  });

  it("其他路径一律 404", async () => {
    expect((await fetch(`${baseUrl}/`)).status).toBe(404);
  });
});

describe("WebSocket 握手准入", () => {
  it("合法令牌 + 合法来源可以连上", async () => {
    const result = await handshake(`/note:42?token=${await token()}`);
    expect(result).toHaveProperty("socket");
    if ("socket" in result) result.socket.close();
  });

  it("缺令牌被拒（400）", async () => {
    expect(await handshake("/note:42")).toEqual({ status: 400 });
  });

  it("房间名非法被拒（400）", async () => {
    expect(await handshake(`/note:0?token=${await token()}`)).toEqual({ status: 400 });
  });

  it("已退役的 index / doc: 房间被拒（400）", async () => {
    expect(await handshake(`/index?token=${await token()}`)).toEqual({ status: 400 });
    expect(await handshake(`/doc:abcdefgh?token=${await token()}`)).toEqual({ status: 400 });
  });

  it("令牌房间与握手房间不一致时 403", async () => {
    const result = await handshake(`/note:7?token=${await token({ room: "note:42" })}`);
    expect(result).toEqual({ status: 403 });
  });

  it("令牌缺 room 声明时 401", async () => {
    expect(await handshake(`/note:42?token=${await token({ room: null })}`)).toEqual({
      status: 401,
    });
  });

  it("来源不在白名单被拒（403）", async () => {
    const result = await handshake(`/note:42?token=${await token()}`, {
      origin: "http://evil.example",
    });
    expect(result).toEqual({ status: 403 });
  });

  it("令牌无效被拒（401）", async () => {
    expect(await handshake("/note:42?token=garbage")).toEqual({ status: 401 });
  });
});

describe("连接生命周期", () => {
  it("连上后服务端立刻推 syncStep1，断开后房间被回收", async () => {
    const result = await handshake(`/note:101?token=${await token({ room: "note:101" })}`);
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
    const url = `/note:102?token=${await token({ room: "note:102" })}`;
    const a = await handshake(url);
    const b = await handshake(url);
    if (!("socket" in a) || !("socket" in b)) throw new Error("握手失败");

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    pump(docA, a);
    pump(docB, b);

    docA.getText("content").insert(0, "协同内容");
    sendUpdate(a.socket, docA);

    await waitFor(() => docB.getText("content").toString() === "协同内容");
    expect(docB.getText("content").toString()).toBe("协同内容");

    a.socket.close();
    b.socket.close();
    await waitFor(() => server.manager.size === 0);
  });

  it("note 房间不落盘：全员断开后房间销毁，重新连上读不到旧内容", async () => {
    const url = `/note:103?token=${await token({ room: "note:103" })}`;
    const a = await handshake(url);
    if (!("socket" in a)) throw new Error("握手失败");
    const docA = new Y.Doc();
    pump(docA, a);

    docA.getText("content").insert(0, "不该留下的内容");
    sendUpdate(a.socket, docA);
    a.socket.close();
    await waitFor(() => server.manager.size === 0);

    // 重开同一房间：服务端内存态已销毁，且没有落盘可读，因此是空的
    const b = await handshake(url);
    if (!("socket" in b)) throw new Error("握手失败");
    const docB = new Y.Doc();
    pump(docB, b);
    await waitFor(() => b.messages.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(docB.getText("content").toString()).toBe("");
    b.socket.close();
  });
});

describe("真实 socket 上的只读连接", () => {
  it("只读连接能读到初始内容，但推上去的 update 不被应用", async () => {
    const url = `/note:104?token=${await token({ room: "note:104", ro: true })}`;
    const writer = await handshake(`/note:104?token=${await token({ room: "note:104" })}`);
    if (!("socket" in writer)) throw new Error("握手失败");
    const docWriter = new Y.Doc();
    pump(docWriter, writer);
    docWriter.getText("content").insert(0, "写者的内容");
    sendUpdate(writer.socket, docWriter);

    // 只读连接进来，应能同步到写者已落进房间的内容
    const reader = await handshake(url);
    if (!("socket" in reader)) throw new Error("握手失败");
    const docReader = new Y.Doc();
    pump(docReader, reader);
    await waitFor(() => docReader.getText("content").toString() === "写者的内容");
    expect(docReader.getText("content").toString()).toBe("写者的内容");

    // 只读端尝试写入：服务端丢弃，文档不变
    docReader.getText("content").insert(0, "越权前缀 ");
    sendUpdate(reader.socket, docReader);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(docWriter.getText("content").toString()).toBe("写者的内容");

    writer.socket.close();
    reader.socket.close();
    await waitFor(() => server.manager.size === 0);
  });
});
