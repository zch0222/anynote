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

/**
 * `y-protocols/sync` 的 sync 子类型。本方案不新增消息类型，但服务端要**区分读写**
 * 才能对只读连接丢写，而 `readSyncMessage` 是委派式的、拿不到子类型，只能在委派前自己读一个 varUint。
 */
export const SYNC_STEP1 = syncProtocol.messageYjsSyncStep1;
export const SYNC_STEP2 = syncProtocol.messageYjsSyncStep2;
export const SYNC_UPDATE = syncProtocol.messageYjsUpdate;

/** 服务端只依赖「能发字节、能关」，测试里用假连接替换真 WebSocket。 */
export type CollabConnection = {
  send(data: Uint8Array): void;
  close(): void;
  /** 只读连接：丢弃 syncStep2 / update 这类写方向消息（D2）。 */
  readonly?: boolean;
  /**
   * 令牌解出的身份。awareness 里的 `user` 只是展示字段，客户端可以自报，
   * 因此服务端在广播前**以令牌为准覆盖**，避免伪造名字 / 颜色（D2）。
   */
  identity?: { userId: string; name: string; color: string } | undefined;
};

/** 服务端本地事务的 origin 标记，用于区分「远端发来的更新」与「本地加载的更新」。 */
export const LOCAL_ORIGIN = Symbol("anynote-collab-local");

/** 客户端自报的 awareness user 是否已与令牌身份一致（展示字段，只比 name / color）。 */
function sameIdentity(user: unknown, identity: { name: string; color: string }): boolean {
  if (user === null || typeof user !== "object") return false;
  const candidate = user as { name?: unknown; color?: unknown };
  return candidate.name === identity.name && candidate.color === identity.color;
}

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
  /** 被拒的写方向消息计数，供 /healthz 观察；**不打日志**——被拒客户端可能循环重试，日志会被打爆。 */
  rejectedWrites = 0;

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
    const conn = origin instanceof Object ? (origin as CollabConnection) : undefined;
    const owned = conn ? this.conns.get(conn) : undefined;
    if (owned) {
      for (const clientId of changes.added) owned.add(clientId);
      for (const clientId of changes.removed) owned.delete(clientId);
    }
    // 身份以令牌为准：覆盖客户端自报的 user，下面的 encodeAwareness 会读到修正后的值。
    if (owned && conn?.identity) {
      const states = this.awareness.getStates();
      for (const clientId of [...changes.added, ...changes.updated]) {
        const state = states.get(clientId) as { user?: unknown } | undefined;
        if (state && !sameIdentity(state.user, conn.identity)) {
          state.user = { name: conn.identity.name, color: conn.identity.color };
        }
      }
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
 *
 * 只读连接（`conn.readonly`）**继续参与 sync 读**——否则连初始内容都收不到——
 * 只丢弃写方向消息：syncStep2（对端推状态）与 update（对端推更新）。
 * syncStep1（对端要状态）必须照常响应，否则只读端永远拿不到初始 sync。
 *
 * 关键实现细节：判定子类型必须用 `peekVarUint` **只读不前进**，
 * 之后由 `readSyncMessage` 从同一位置自己读掉类型字节。若这里改成 readVarUint 推进了
 * 光标，丢弃分支虽无碍，放行分支会把已读掉的字节又交给 readSyncMessage，
 * 初始 sync 会直接解错。
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
      if (conn.readonly) {
        // 丢弃前先看是不是写方向；syncStep1 是读，必须放行。
        const subType = decoding.peekVarUint(decoder);
        if (subType === SYNC_STEP2 || subType === SYNC_UPDATE) {
          shared.rejectedWrites += 1;
          return MESSAGE_SYNC;
        }
      }

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
      // awareness 是纯在线状态，只读连接照常放行（要能看到别人的光标）。
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

/**
 * 接入一条新连接：登记 → （可写连接）发 syncStep1 索取对端状态 → 把现有 awareness 推过去。
 *
 * **只读连接不发 syncStep1**：发它等于主动索取对端状态，而对端回的 step2 又会被自己丢掉，
 * 白跑一趟还会把 `rejectedWrites` 计数打脏（每个只读连接各 +1），让「有没有人在循环重试」
 * 这个观察指标失去意义。只读端本来就会发自己的 step1 来取内容，少这一步不影响它拿到初始内容。
 */
export function addConnection(shared: CollabDoc, conn: CollabConnection) {
  shared.conns.set(conn, new Set<number>());
  if (!conn.readonly) {
    conn.send(encodeSyncStep1(shared.doc));
  }

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
