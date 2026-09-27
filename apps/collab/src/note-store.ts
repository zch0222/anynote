import { createHmac } from "node:crypto";

/** 笔记协同快照：真相源（正文、标题、版本号）加上次写回时存下的 Y 状态。 */
export type NoteSnapshot = {
  title: string;
  content: string;
  version: string;
  state: Uint8Array | null;
  stateVersion: string | null;
  epoch: string | null;
};

/** 写回请求。`title` 为 null 表示不修改标题；`operatorId` 为 null 表示沿用笔记的最后更新者。 */
export type StoreInput = {
  title: string | null;
  content: string;
  state: Uint8Array;
  epoch: string;
  baseVersion: string;
  operatorId: number | null;
};

export type StoreResult = { ok: true; version: string } | { ok: false; reason: "conflict" };

/** 笔记不存在或已删除（note 服务返回 A0404）。 */
export class NoteNotFoundError extends Error {
  constructor(noteId: number) {
    super(`笔记 ${noteId} 不存在或已删除`);
    this.name = "NoteNotFoundError";
  }
}

/** note 服务返回的业务错误（非 A0404 / A0409）或网络、超时、非 2xx 响应。 */
export class NoteStoreError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "NoteStoreError";
    this.code = code;
  }
}

export type NoteStore = {
  load(noteId: number): Promise<NoteSnapshot>;
  store(noteId: number, input: StoreInput): Promise<StoreResult>;
};

const SUCCESS = "00000";
const NOT_FOUND = "A0404";
const VERSION_CONFLICT = "A0409";

/**
 * 内部调用签名头，与 Java `HmacUtils.sign(secret, timestamp)` 一致：
 * `X-Internal-Sign = Base64(HMAC-SHA256(secret, timestamp))`。
 *
 * @param secret 与 note 服务 `anynote.internal.secret` 相同的密钥
 * @param now 签名时刻（毫秒），默认当前时间
 */
export function internalHeaders(secret: string, now = Date.now()): Record<string, string> {
  const timestamp = String(now);
  return {
    "from-source": "inner",
    "X-Internal-Timestamp": timestamp,
    "X-Internal-Sign": createHmac("sha256", secret).update(timestamp).digest("base64"),
  };
}

type Envelope<T> = { code?: string; msg?: string; data?: T };

type SnapshotBody = {
  title?: string | null;
  content?: string | null;
  version?: string | null;
  state?: string | null;
  stateVersion?: string | null;
  epoch?: string | null;
};

/**
 * 调用 note 服务内部端点的 HTTP 客户端。
 *
 * - `load`：`GET {baseUrl}/notes/{id}/collab-snapshot`，A0404 抛 {@link NoteNotFoundError}，
 *   其他非成功结果抛 {@link NoteStoreError}。
 * - `store`：`PUT {baseUrl}/notes/{id}/collab-snapshot`，A0409 返回 `{ ok: false, reason: "conflict" }`，
 *   A0404 抛 {@link NoteNotFoundError}，其他失败抛 {@link NoteStoreError}。
 * - Y 状态在 JSON 里以 Base64 传输；每个请求默认 10 秒超时。
 */
export function createNoteStore(options: {
  baseUrl: string;
  secret: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}): NoteStore {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 10_000;
  const doFetch = options.fetch ?? fetch;

  async function request<T>(
    noteId: number,
    init: { method: string; body?: unknown },
  ): Promise<Envelope<T>> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}/notes/${noteId}/collab-snapshot`, {
        method: init.method,
        headers: {
          ...internalHeaders(options.secret),
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new NoteStoreError(
        `请求 note 服务失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const envelope = (await response.json().catch(() => null)) as Envelope<T> | null;
    if (!envelope || typeof envelope.code !== "string") {
      throw new NoteStoreError(`note 服务响应格式异常（HTTP ${response.status}）`);
    }
    if (envelope.code === NOT_FOUND) throw new NoteNotFoundError(noteId);
    return envelope;
  }

  return {
    async load(noteId) {
      const envelope = await request<SnapshotBody>(noteId, { method: "GET" });
      if (envelope.code !== SUCCESS || !envelope.data) {
        throw new NoteStoreError(envelope.msg ?? "读取协同快照失败", envelope.code ?? null);
      }
      const data = envelope.data;
      if (typeof data.version !== "string" || data.version === "") {
        throw new NoteStoreError("协同快照缺少版本号");
      }
      return {
        title: data.title ?? "",
        content: data.content ?? "",
        version: data.version,
        state: data.state ? new Uint8Array(Buffer.from(data.state, "base64")) : null,
        stateVersion: data.stateVersion ?? null,
        epoch: data.epoch ?? null,
      };
    },

    async store(noteId, input) {
      const envelope = await request<{ version?: string | null }>(noteId, {
        method: "PUT",
        body: {
          title: input.title,
          content: input.content,
          state: Buffer.from(input.state).toString("base64"),
          epoch: input.epoch,
          baseVersion: input.baseVersion,
          operatorId: input.operatorId,
        },
      });
      if (envelope.code === VERSION_CONFLICT) return { ok: false, reason: "conflict" };
      if (envelope.code !== SUCCESS || typeof envelope.data?.version !== "string") {
        throw new NoteStoreError(envelope.msg ?? "写回协同快照失败", envelope.code ?? null);
      }
      return { ok: true, version: envelope.data.version };
    },
  };
}
