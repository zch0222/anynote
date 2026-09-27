import { createServer } from "node:http";
import { join } from "node:path";
import { EDITOR_SCHEMA_VERSION } from "@anynote/editor-core";
import { WebSocket, WebSocketServer } from "ws";
import type { CollabConfig } from "./config.ts";
import { type Converter, createConverter } from "./converter.ts";
import { CollabDocManager } from "./doc-manager.ts";
import type { ExternalUpdateSource } from "./external-updates.ts";
import { type NoteRoom, NoteRoomManager } from "./note-rooms.ts";
import { NoteNotFoundError, type NoteStore, createNoteStore } from "./note-store.ts";
import {
  type RoomSpool,
  createFileSpool,
  disabledSpool,
  memoryOnlyPersistence,
} from "./persistence.ts";
import {
  ANYNOTE_ACK,
  ANYNOTE_EPOCH_MISMATCH,
  ANYNOTE_HELLO,
  CLOSE_EDITOR_VERSION,
  CLOSE_EPOCH_MISMATCH,
  CLOSE_NOT_FOUND,
  CLOSE_UNAVAILABLE,
  type CollabConnection,
  addConnection,
  encodeAnynoteMessage,
  handleMessage,
  removeConnection,
} from "./protocol.ts";
import { type CollabSession, authorizeUpgrade } from "./upgrade.ts";

/** 心跳周期：超过一个周期没收到 pong 就判定连接已死并断开。 */
const PING_INTERVAL_MS = 30_000;

/** 可替换的外部依赖，测试里用假的 note 服务与内存应急落盘替换。 */
export type CollabServerDeps = {
  noteStore?: NoteStore;
  converter?: Converter;
  spool?: RoomSpool;
  externalUpdates?: ExternalUpdateSource;
};

export function createCollabServer(config: CollabConfig, deps: CollabServerDeps = {}) {
  const onError = (error: unknown, room: string) =>
    console.error(`[collab] 房间 ${room} 出错`, error);

  /*
   * 两种模式：
   * - 服务端落库（COLLAB_SERVER_PERSIST）：开房时从 note 服务加载，由协同服务写回 MySQL；
   * - 客户端保存（默认）：房间只在内存里，冷启动由客户端注入、由客户端各自保存。
   */
  const legacyRooms = config.serverPersist
    ? null
    : new CollabDocManager({ persistence: memoryOnlyPersistence, onError });
  const converter = config.serverPersist ? (deps.converter ?? createConverter()) : null;
  const noteRooms =
    config.serverPersist && converter
      ? new NoteRoomManager({
          store:
            deps.noteStore ??
            createNoteStore({
              baseUrl: config.noteServiceUrl ?? "",
              secret: config.internalSecret ?? "",
            }),
          converter,
          spool:
            deps.spool ??
            (config.persistenceDir
              ? createFileSpool(join(config.persistenceDir, "spool"))
              : disabledSpool),
          debounceMs: config.storeDebounceMs,
          maxDebounceMs: config.storeMaxDebounceMs,
          onError,
        })
      : null;
  const externalUpdates =
    noteRooms && deps.externalUpdates
      ? deps.externalUpdates.subscribe((noteId) => void noteRooms.applyExternalUpdate(noteId))
      : null;

  const manager = {
    get size() {
      return noteRooms ? noteRooms.size : (legacyRooms?.size ?? 0);
    },
    rooms: () => (noteRooms ? noteRooms.rooms() : (legacyRooms?.rooms() ?? [])),
    rejectedWrites: (room: string) =>
      noteRooms ? noteRooms.rejectedWrites(room) : (legacyRooms?.rejectedWrites(room) ?? 0),
  };

  const httpServer = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      // rejectedWrites 汇总各房间被丢弃的写方向消息数，供观察只读连接是否在重试。
      let rejectedWrites = 0;
      for (const room of manager.rooms()) {
        rejectedWrites += manager.rejectedWrites(room);
      }
      response.end(
        JSON.stringify({
          status: "ok",
          rooms: manager.size,
          rejectedWrites,
          serverPersist: config.serverPersist,
          ...(noteRooms ? noteRooms.health() : {}),
        }),
      );
      return;
    }
    response.writeHead(404).end();
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    // 握手在升级前判定：拒绝时回原始 HTTP 响应，客户端能拿到明确状态码。
    void authorizeUpgrade(request.url, request.headers.origin, config).then((decision) => {
      if (!decision.ok) {
        socket.write(
          `HTTP/1.1 ${decision.status} ${decision.message}\r\nConnection: close\r\n\r\n`,
        );
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        if (noteRooms) {
          void attachPersistent(noteRooms, ws, decision.room, decision.session);
        } else if (legacyRooms) {
          void attachLegacy(legacyRooms, ws, decision.room, decision.session);
        }
      });
    });
  });

  /** 心跳：定期 ping，超过一个周期没有 pong 就断开。 */
  function startHeartbeat(ws: WebSocket): NodeJS.Timeout {
    let alive = true;
    ws.on("pong", () => {
      alive = true;
    });
    return setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, PING_INTERVAL_MS);
  }

  function connectionFor(ws: WebSocket, session: CollabSession): CollabConnection {
    return {
      send: (data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      },
      close: (code, reason) => ws.close(code, reason),
      readonly: session.ro,
      identity: session.identity,
    };
  }

  async function attachLegacy(
    rooms: CollabDocManager,
    ws: WebSocket,
    room: string,
    session: CollabSession,
  ) {
    const shared = await rooms.open(room);
    const conn = connectionFor(ws, session);

    // 文档加载是异步的，期间客户端可能已经断开，此时不要再登记连接。
    if (ws.readyState !== WebSocket.OPEN) {
      await rooms.closeIfEmpty(room);
      return;
    }

    addConnection(shared, conn);
    const heartbeat = startHeartbeat(ws);
    ws.on("message", (data) => {
      handleMessage(shared, conn, toUint8Array(data));
    });
    ws.on("close", () => {
      clearInterval(heartbeat);
      removeConnection(shared, conn);
      void rooms.closeIfEmpty(room);
    });
  }

  /**
   * 服务端落库模式下接入一条连接。
   *
   * 1. 先挂 `message` 监听并缓冲：开房要走 HTTP 加载，握手后立刻到达的同步消息不能丢；
   * 2. 编辑器版本不一致时以 4426 断开；
   * 3. 开房（笔记不存在 4404，暂时加载不了 4503）；
   * 4. 谱系判定：`fresh` 或与房间相同的 `epoch` 放行，否则发谱系不符并以 4409 断开；
   * 5. 发 hello，登记连接，按到达顺序处理缓冲的消息。
   */
  async function attachPersistent(
    rooms: NoteRoomManager,
    ws: WebSocket,
    roomName: string,
    session: CollabSession,
  ) {
    const buffered: Uint8Array[] = [];
    let deliver: ((message: Uint8Array) => void) | null = null;
    ws.on("message", (data) => {
      const message = toUint8Array(data);
      if (deliver) deliver(message);
      else buffered.push(message);
    });

    if (session.editorVersion !== EDITOR_SCHEMA_VERSION) {
      ws.close(CLOSE_EDITOR_VERSION, `editor-version:${EDITOR_SCHEMA_VERSION}`);
      return;
    }

    let room: NoteRoom;
    try {
      room = await rooms.open(roomName);
    } catch (error) {
      if (error instanceof NoteNotFoundError) {
        ws.close(CLOSE_NOT_FOUND, "note-not-found");
        return;
      }
      onError(error, roomName);
      ws.close(CLOSE_UNAVAILABLE, "room-unavailable");
      return;
    }

    if (ws.readyState !== WebSocket.OPEN) {
      await rooms.closeIfEmpty(roomName);
      return;
    }

    const lineage = session.lineage;
    const lineageMatches =
      lineage.kind === "fresh" || (lineage.kind === "epoch" && lineage.epoch === room.epoch);
    if (!lineageMatches) {
      ws.send(encodeAnynoteMessage(ANYNOTE_EPOCH_MISMATCH));
      ws.close(CLOSE_EPOCH_MISMATCH, "epoch-mismatch");
      await rooms.closeIfEmpty(roomName);
      return;
    }

    const conn = connectionFor(ws, session);
    if (!session.ro) {
      const ack = encodeAnynoteMessage(ANYNOTE_ACK);
      conn.acknowledge = () => conn.send(ack);
    }
    conn.send(
      encodeAnynoteMessage(ANYNOTE_HELLO, {
        serverPersist: true,
        epoch: room.epoch,
        editorVersion: EDITOR_SCHEMA_VERSION,
      }),
    );
    addConnection(room.shared, conn);
    const heartbeat = startHeartbeat(ws);
    ws.on("close", () => {
      clearInterval(heartbeat);
      removeConnection(room.shared, conn);
      void rooms.closeIfEmpty(roomName);
    });

    deliver = (message) => handleMessage(room.shared, conn, message);
    for (const message of buffered.splice(0)) {
      handleMessage(room.shared, conn, message);
    }
  }

  return {
    httpServer,
    wss,
    manager,
    noteRooms,
    listen: () =>
      new Promise<void>((resolve) => {
        httpServer.listen(config.port, config.host, resolve);
      }),
    close: async () => {
      await externalUpdates?.close();
      for (const client of wss.clients) client.close();
      if (noteRooms) await noteRooms.flushAll();
      if (legacyRooms) await legacyRooms.flushAll();
      converter?.destroy();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

/** ws 的 message 事件可能给 Buffer、ArrayBuffer 或 Buffer[]，统一成 Uint8Array。 */
function toUint8Array(data: Buffer | ArrayBuffer | Buffer[]): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
