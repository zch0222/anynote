import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { CollabConfig } from "./config.ts";
import { CollabDocManager } from "./doc-manager.ts";
import { memoryOnlyPersistence } from "./persistence.ts";
import {
  type CollabConnection,
  addConnection,
  handleMessage,
  removeConnection,
} from "./protocol.ts";
import { authorizeUpgrade } from "./upgrade.ts";

/** 心跳周期：超过一个周期没收到 pong 就判定连接已死并断开。 */
const PING_INTERVAL_MS = 30_000;

export function createCollabServer(config: CollabConfig) {
  /*
   * note 房间不落盘（D3）：真相源是 MySQL，冷启动恒为空 ⇒ 恒从 DB 注入，
   * 没有「缓存新旧」可裁，也不可能读到被 CLI / legacy 改过之后的陈旧缓存。
   * 这里直接给 memoryOnlyPersistence——room 只剩 note 一种，无需按房间类型分支。
   *
   * `persistence.ts` 的文件实现与目录穿越防护保留原样，作为能力备用（当前无调用方）。
   * 副作用：即便配置了 COLLAB_PERSISTENCE_DIR，note 房间也不会写文件——
   * 这正是目标态，配置项保留是为了将来需要落盘时不必改接口。
   */
  const persistence = memoryOnlyPersistence;

  const manager = new CollabDocManager({
    persistence,
    onError: (error, room) => console.error(`[collab] 房间 ${room} 存储失败`, error),
  });

  const httpServer = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      // rejectedWrites 汇总各房间被丢弃的写方向消息数，供观察只读连接是否在重试。
      let rejectedWrites = 0;
      for (const room of manager.rooms()) {
        rejectedWrites += manager.rejectedWrites(room);
      }
      response.end(JSON.stringify({ status: "ok", rooms: manager.size, rejectedWrites }));
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
        void attach(ws, decision.room, decision.session);
      });
    });
  });

  async function attach(
    ws: WebSocket,
    room: string,
    session: { identity: CollabConnection["identity"]; ro: boolean },
  ) {
    const shared = await manager.open(room);
    const conn: CollabConnection = {
      send: (data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      },
      close: () => ws.close(),
      readonly: session.ro,
      identity: session.identity,
    };

    // 文档加载是异步的，期间客户端可能已经断开，此时不要再登记连接。
    if (ws.readyState !== WebSocket.OPEN) {
      await manager.closeIfEmpty(room);
      return;
    }

    addConnection(shared, conn);

    let alive = true;
    ws.on("pong", () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, PING_INTERVAL_MS);

    ws.on("message", (data) => {
      handleMessage(shared, conn, toUint8Array(data));
    });

    ws.on("close", () => {
      clearInterval(heartbeat);
      removeConnection(shared, conn);
      void manager.closeIfEmpty(room);
    });
  }

  return {
    httpServer,
    wss,
    manager,
    listen: () =>
      new Promise<void>((resolve) => {
        httpServer.listen(config.port, config.host, resolve);
      }),
    close: async () => {
      for (const client of wss.clients) client.close();
      await manager.flushAll();
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
