import { type IncomingMessage, type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { EDITOR_SCHEMA_VERSION } from "@anynote/editor-core";
import { SignJWT } from "jose";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { COLLAB_TOKEN_AUDIENCE, COLLAB_TOKEN_ISSUER } from "../auth.ts";
import type { CollabConfig } from "../config.ts";
import { type Converter, createConverter } from "../converter.ts";
import { internalHeaders } from "../note-store.ts";
import type { RoomSpool, SpoolRecord } from "../persistence.ts";
import {
  ANYNOTE_ACK,
  ANYNOTE_EPOCH_MISMATCH,
  ANYNOTE_HELLO,
  CLOSE_EDITOR_VERSION,
  CLOSE_EPOCH_MISMATCH,
  CLOSE_NOT_FOUND,
  MESSAGE_ANYNOTE,
  decodeAnynoteMessage,
} from "../protocol.ts";
import { createCollabServer } from "../server.ts";

/**
 * 服务端落库模式的端到端单测：真实 WebSocket 服务 + 假的 note 服务 HTTP 端点，不依赖任何中间件。
 */

const TOKEN_SECRET = "a-very-long-dev-secret";
const INTERNAL_SECRET = "internal-secret-0123456789";
const ORIGIN = "http://localhost:3000";

type FakeNote = {
  title: string;
  content: string;
  version: number;
  state: string | null;
  stateVersion: string | null;
  epoch: string | null;
};

/** 假 note 服务：校验内部签名，按版本号原子比较，可注入延迟与故障。 */
class FakeNoteService {
  readonly notes = new Map<number, FakeNote>();
  readonly puts: Array<{ noteId: number; body: Record<string, unknown> }> = [];
  loadDelayMs = 0;
  failPuts = false;
  unsignedRequests = 0;
  loads = 0;
  server: Server | null = null;
  baseUrl = "";

  seed(noteId: number, content: string, title = "周会纪要") {
    this.notes.set(noteId, {
      title,
      content,
      version: 1_790_265_600_000,
      state: null,
      stateVersion: null,
      epoch: null,
    });
  }

  private signed(request: IncomingMessage): boolean {
    const timestamp = String(request.headers["x-internal-timestamp"] ?? "");
    const expected = internalHeaders(INTERNAL_SECRET, Number(timestamp))["X-Internal-Sign"];
    return (
      request.headers["from-source"] === "inner" && request.headers["x-internal-sign"] === expected
    );
  }

  async start() {
    this.server = createServer((request, response) => {
      const reply = (code: string, data: unknown = null) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ code, msg: code, data }));
      };
      if (!this.signed(request)) {
        this.unsignedRequests += 1;
        reply("A0301");
        return;
      }
      const match = /^\/notes\/(\d+)\/collab-snapshot$/.exec(request.url ?? "");
      const noteId = Number(match?.[1]);
      const note = this.notes.get(noteId);
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        void (async () => {
          if (!note) return reply("A0404");
          if (request.method === "GET") {
            this.loads += 1;
            if (this.loadDelayMs > 0)
              await new Promise((resolve) => setTimeout(resolve, this.loadDelayMs));
            return reply("00000", { ...note, version: String(note.version) });
          }
          const input = JSON.parse(body) as Record<string, unknown>;
          this.puts.push({ noteId, body: input });
          if (this.failPuts) {
            response.writeHead(500).end("boom");
            return;
          }
          if (input.baseVersion !== String(note.version)) return reply("A0409");
          note.version += 1000;
          note.content = String(input.content);
          if (typeof input.title === "string") note.title = input.title;
          note.state = String(input.state);
          note.stateVersion = String(note.version);
          note.epoch = String(input.epoch);
          return reply("00000", { version: String(note.version) });
        })();
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", resolve));
    this.baseUrl = `http://127.0.0.1:${(this.server?.address() as AddressInfo).port}`;
  }

  async stop() {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }
}

class MemorySpool implements RoomSpool {
  readonly records = new Map<string, SpoolRecord>();
  async read(room: string) {
    return this.records.get(room) ?? null;
  }
  async write(room: string, record: SpoolRecord) {
    this.records.set(room, record);
  }
  async remove(room: string) {
    this.records.delete(room);
  }
  async quarantine(room: string) {
    this.records.delete(room);
  }
}

const noteService = new FakeNoteService();
let converter: Converter;
let collab: ReturnType<typeof createCollabServer>;
let wsUrl: string;
let baseUrl: string;
let notify: ((noteId: number) => void) | null = null;
const sockets: WebSocket[] = [];

function token(noteId: number, options: { ro?: boolean; subject?: string } = {}) {
  return new SignJWT({ name: "甲", room: `note:${noteId}`, ro: options.ro ?? false })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(COLLAB_TOKEN_ISSUER)
    .setAudience(COLLAB_TOKEN_AUDIENCE)
    .setSubject(options.subject ?? "7")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(TOKEN_SECRET));
}

type Client = {
  socket: WebSocket;
  doc: Y.Doc;
  custom: Array<{ subType: number; payload: Record<string, unknown> }>;
  closed: Promise<{ code: number; reason: string }>;
  synced: Promise<void>;
};

/**
 * 模拟 y-websocket 客户端：打开即发 syncStep1；收到同步消息喂进本地 Y.Doc 并按协议回包；
 * 自定义消息记录下来供断言。
 */
async function connect(
  noteId: number,
  params: Record<string, string>,
  options: { ro?: boolean; doc?: Y.Doc } = {},
): Promise<Client> {
  const query = new URLSearchParams({ token: await token(noteId, options), ...params });
  const socket = new WebSocket(`${wsUrl}/note:${noteId}?${query}`, { headers: { origin: ORIGIN } });
  sockets.push(socket);
  const doc = options.doc ?? new Y.Doc();
  const custom: Client["custom"] = [];
  let resolveSynced: () => void = () => {};
  const synced = new Promise<void>((resolve) => {
    resolveSynced = resolve;
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    socket.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });
  socket.on("message", (data) => {
    const bytes = new Uint8Array(data as Buffer);
    if (bytes[0] === MESSAGE_ANYNOTE) {
      const message = decodeAnynoteMessage(bytes);
      if (message) custom.push(message);
      return;
    }
    const decoder = decoding.createDecoder(bytes);
    if (decoding.readVarUint(decoder) !== 0) return;
    const subType = decoding.peekVarUint(decoder);
    const reply = encoding.createEncoder();
    encoding.writeVarUint(reply, 0);
    syncProtocol.readSyncMessage(decoder, reply, doc, "remote");
    if (encoding.length(reply) > 1) socket.send(encoding.toUint8Array(reply));
    if (subType === syncProtocol.messageYjsSyncStep2) resolveSynced();
  });
  socket.on("open", () => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    syncProtocol.writeSyncStep1(encoder, doc);
    socket.send(encoding.toUint8Array(encoder));
  });
  return { socket, doc, custom, closed, synced };
}

/** 在客户端文档上把内容改成 markdown，并把这次改动以 update 发给服务端。 */
function editOn(client: Client, markdown: string) {
  const before = Y.encodeStateVector(client.doc);
  converter.applyMarkdown(client.doc, markdown);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(client.doc, before));
  client.socket.send(encoding.toUint8Array(encoder));
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("等待条件超时");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const current = { version: String(EDITOR_SCHEMA_VERSION), lineage: "fresh" };

beforeAll(async () => {
  converter = createConverter();
  await noteService.start();
  const config: CollabConfig = {
    host: "127.0.0.1",
    port: 0,
    tokenSecret: TOKEN_SECRET,
    persistenceDir: null,
    allowedOrigins: [ORIGIN],
    serverPersist: true,
    noteServiceUrl: noteService.baseUrl,
    internalSecret: INTERNAL_SECRET,
    storeDebounceMs: 200,
    storeMaxDebounceMs: 1_000,
    redisUrl: null,
  };
  collab = createCollabServer(config, {
    converter,
    spool: new MemorySpool(),
    externalUpdates: {
      subscribe(onUpdate) {
        notify = onUpdate;
        return { close: async () => {} };
      },
    },
  });
  await collab.listen();
  const { port } = collab.httpServer.address() as AddressInfo;
  wsUrl = `ws://127.0.0.1:${port}`;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  noteService.loadDelayMs = 0;
  noteService.failPuts = false;
  await waitFor(() => (collab.noteRooms?.size ?? 0) === 0, 10_000).catch(() => {});
});

afterAll(async () => {
  await collab.close();
  await noteService.stop();
});

describe("握手：编辑器版本、谱系与 hello", () => {
  it("版本一致、fresh 客户端收到 hello（带谱系）并完成同步", async () => {
    noteService.seed(101, "# 周会纪要\n\n正文");
    const client = await connect(101, { editorVersion: current.version, lineage: "fresh" });
    await client.synced;

    const hello = client.custom.find((message) => message.subType === ANYNOTE_HELLO);
    expect(hello?.payload).toMatchObject({
      serverPersist: true,
      editorVersion: EDITOR_SCHEMA_VERSION,
      epoch: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(converter.serialize(client.doc).markdown).toBe("# 周会纪要\n\n正文");
  });

  it("不带编辑器版本的旧客户端以 4426 断开，关闭原因里带服务端版本", async () => {
    noteService.seed(102, "# 旧客户端");
    const client = await connect(102, {});
    expect(await client.closed).toEqual({
      code: CLOSE_EDITOR_VERSION,
      reason: `editor-version:${EDITOR_SCHEMA_VERSION}`,
    });
  });

  it("编辑器版本不一致时以 4426 断开", async () => {
    noteService.seed(103, "# 版本不一致");
    const client = await connect(103, {
      editorVersion: String(EDITOR_SCHEMA_VERSION + 1),
      lineage: "fresh",
    });
    expect((await client.closed).code).toBe(CLOSE_EDITOR_VERSION);
  });

  it("谱系不符时先发谱系不符消息再以 4409 断开；unknown 同样拒绝", async () => {
    noteService.seed(104, "# 谱系");
    const mismatched = await connect(104, {
      editorVersion: current.version,
      lineage: "epoch:00000000-0000-5000-8000-000000000000",
    });
    expect((await mismatched.closed).code).toBe(CLOSE_EPOCH_MISMATCH);
    expect(mismatched.custom.map((message) => message.subType)).toContain(ANYNOTE_EPOCH_MISMATCH);

    const unknown = await connect(104, { editorVersion: current.version, lineage: "unknown" });
    expect((await unknown.closed).code).toBe(CLOSE_EPOCH_MISMATCH);
  });

  it("带着与房间相同谱系的客户端放行", async () => {
    noteService.seed(105, "# 同谱系");
    const first = await connect(105, { editorVersion: current.version, lineage: "fresh" });
    await first.synced;
    const epoch = String(
      first.custom.find((message) => message.subType === ANYNOTE_HELLO)?.payload.epoch,
    );

    const second = await connect(
      105,
      { editorVersion: current.version, lineage: `epoch:${epoch}` },
      { doc: first.doc },
    );
    await second.synced;
    expect(second.custom.some((message) => message.subType === ANYNOTE_HELLO)).toBe(true);
  });

  it("笔记不存在时以 4404 断开", async () => {
    const client = await connect(199, { editorVersion: current.version, lineage: "fresh" });
    expect((await client.closed).code).toBe(CLOSE_NOT_FOUND);
  });

  it("开房耗时 300ms 时，握手后立刻到达的消息被缓冲，客户端仍能完成同步", async () => {
    noteService.seed(106, "# 慢开房\n\n正文");
    noteService.loadDelayMs = 300;
    const client = await connect(106, { editorVersion: current.version, lineage: "fresh" });
    await client.synced;
    expect(converter.serialize(client.doc).markdown).toBe("# 慢开房\n\n正文");
  });
});

describe("编辑、确认与落库", () => {
  it("可写连接的每次更新都回 ACK，防抖到期后带内部签名写回 note 服务", async () => {
    noteService.seed(201, "# 周会纪要\n\n正文");
    const client = await connect(201, { editorVersion: current.version, lineage: "fresh" });
    await client.synced;

    editOn(client, "# 周会纪要\n\n正文加一句");
    await waitFor(() => client.custom.some((message) => message.subType === ANYNOTE_ACK));
    await waitFor(() => noteService.notes.get(201)?.content === "# 周会纪要\n\n正文加一句");

    expect(noteService.unsignedRequests).toBe(0);
    expect(noteService.puts.at(-1)?.body).toMatchObject({ title: "周会纪要", operatorId: 7 });
  });

  it("只读连接的写消息被丢弃，也不回 ACK", async () => {
    noteService.seed(202, "# 只读");
    const client = await connect(
      202,
      { editorVersion: current.version, lineage: "fresh" },
      { ro: true },
    );
    await client.synced;

    editOn(client, "# 只读\n\n不该写进去");
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(client.custom.some((message) => message.subType === ANYNOTE_ACK)).toBe(false);
    expect(noteService.notes.get(202)?.content).toBe("# 只读");
  });

  it("打开一篇老笔记不编辑就离开，不写库", async () => {
    noteService.seed(203, "没有标题的老笔记");
    const client = await connect(203, { editorVersion: current.version, lineage: "fresh" });
    await client.synced;
    client.socket.close();
    await waitFor(() => collab.noteRooms?.size === 0);
    expect(noteService.puts.filter((put) => put.noteId === 203)).toHaveLength(0);
  });

  it("note 服务写库失败时 /healthz 报出失败房间，房间在最后一人离开后仍保留", async () => {
    noteService.seed(204, "# 故障");
    noteService.failPuts = true;
    const client = await connect(204, { editorVersion: current.version, lineage: "fresh" });
    await client.synced;
    editOn(client, "# 故障\n\n改动");
    await waitFor(() => noteService.puts.some((put) => put.noteId === 204));

    const health = (await (await fetch(`${baseUrl}/healthz`)).json()) as {
      serverPersist: boolean;
      failingRooms: Array<{ room: string }>;
    };
    expect(health.serverPersist).toBe(true);
    expect(health.failingRooms.map((item) => item.room)).toContain("note:204");

    client.socket.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(collab.noteRooms?.rooms()).toContain("note:204");

    noteService.failPuts = false;
    await waitFor(() => noteService.notes.get(204)?.content === "# 故障\n\n改动", 8_000);
    await waitFor(() => !collab.noteRooms?.rooms().includes("note:204"), 8_000);
  });
});

describe("外部写入通知", () => {
  it("房间在线时收到通知立即合并，并广播给在线客户端", async () => {
    noteService.seed(301, "# 通知\n\n原文");
    const client = await connect(301, { editorVersion: current.version, lineage: "fresh" });
    await client.synced;

    const note = noteService.notes.get(301);
    if (!note) throw new Error("缺少笔记");
    note.version += 1000;
    note.content = "# 通知\n\n外部写入";
    notify?.(301);

    await waitFor(() => converter.serialize(client.doc).markdown === "# 通知\n\n外部写入");
  });

  it("房间不在内存里时忽略通知，不回读 note 服务", async () => {
    const loads = noteService.loads;
    notify?.(302);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(noteService.loads).toBe(loads);
  });
});
