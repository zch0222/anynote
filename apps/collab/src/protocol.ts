import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

/**
 * y-websocket 线协议：每条消息第一个 varUint 是消息类型。
 * 这两个值是与 `y-websocket` 客户端的硬契约，不能改。
 */
export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;

/** 服务端只依赖「能发字节、能关」，测试里用假连接替换真 WebSocket。 */
export type CollabConnection = {
  send(data: Uint8Array): void;
  close(): void;
};

/** 服务端本地事务的 origin 标记，用于区分「远端发来的更新」与「本地加载的更新」。 */
export const LOCAL_ORIGIN = Symbol("anynote-collab-local");

/**
 * 一个房间的共享文档：Y.Doc + awareness + 连接表。
 *
 * 连接表记录每条连接「声明过的 clientID」，断开时要把这些 awareness 状态清掉，
 * 否则其他人会一直看到已离线用户的光标。
 */
export class CollabDoc {
  readonly name: string;
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;
  readonly conns = new Map<CollabConnection, Set<number>>();
  /** 解析单条消息失败时的上报口子；默认吞掉，由 DocManager 接成日志。 */
  onError: (error: unknown, room: string) => void = () => {};

  constructor(name: string) {
    this.name = name;
    this.doc = new Y.Doc({ gc: true });
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    // 服务端不参与编辑，自己的 awareness 状态永远是空的。
    this.awareness.setLocalState(null);

    this.doc.on("update", this.handleDocUpdate);
    this.awareness.on("update", this.handleAwarenessUpdate);
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    // 本地加载持久化状态时不广播：此时还没有连接，广播是纯浪费。
    if (origin === LOCAL_ORIGIN && this.conns.size === 0) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    this.broadcast(encoding.toUint8Array(encoder));
  };

  private handleAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    const changed = [...changes.added, ...changes.updated, ...changes.removed];
    // 把 clientID 记到发起连接名下，断线时才知道该清哪些状态。
    const owned = origin instanceof Object ? this.conns.get(origin as CollabConnection) : undefined;
    if (owned) {
      for (const clientId of changes.added) owned.add(clientId);
      for (const clientId of changes.removed) owned.delete(clientId);
    }
    if (changed.length === 0) return;
    this.broadcast(encodeAwareness(this.awareness, changed));
  };

  broadcast(message: Uint8Array) {
    for (const conn of this.conns.keys()) {
      conn.send(message);
    }
  }

  destroy() {
    this.doc.off("update", this.handleDocUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);
    this.awareness.destroy();
    this.doc.destroy();
  }
}

/** syncStep1：把本地状态向量发给对端，让对端算出缺什么。 */
export function encodeSyncStep1(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

export function encodeAwareness(
  awareness: awarenessProtocol.Awareness,
  clients: number[],
): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, clients));
  return encoding.toUint8Array(encoder);
}

/**
 * 处理一条客户端消息。返回实际识别出的消息类型，无法识别时返回 null
 * （不抛错：一个坏包不该拖垮整个房间）。
 */
export function handleMessage(
  shared: CollabDoc,
  conn: CollabConnection,
  message: Uint8Array,
): number | null {
  try {
    const decoder = decoding.createDecoder(message);
    const type = decoding.readVarUint(decoder);

    if (type === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, shared.doc, conn);
      // 只有 syncStep1 会产生回包；长度为 1 表示编码器里只有类型字节。
      if (encoding.length(encoder) > 1) {
        conn.send(encoding.toUint8Array(encoder));
      }
      return MESSAGE_SYNC;
    }

    if (type === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(
        shared.awareness,
        decoding.readVarUint8Array(decoder),
        conn,
      );
      return MESSAGE_AWARENESS;
    }

    return null;
  } catch (error) {
    // 单条坏包只丢这条消息，连接与房间照常存活。
    shared.onError(error, shared.name);
    return null;
  }
}

/** 接入一条新连接：登记 → 发 syncStep1 → 把现有 awareness 状态推过去。 */
export function addConnection(shared: CollabDoc, conn: CollabConnection) {
  shared.conns.set(conn, new Set<number>());
  conn.send(encodeSyncStep1(shared.doc));

  const clients = [...shared.awareness.getStates().keys()];
  if (clients.length > 0) {
    conn.send(encodeAwareness(shared.awareness, clients));
  }
}

/** 摘除一条连接，并清掉它持有的 awareness 状态（让别人的光标列表里消失）。 */
export function removeConnection(shared: CollabDoc, conn: CollabConnection) {
  const owned = shared.conns.get(conn);
  if (!owned) return;
  shared.conns.delete(conn);
  if (owned.size > 0) {
    awarenessProtocol.removeAwarenessStates(shared.awareness, [...owned], null);
  }
  conn.close();
}
