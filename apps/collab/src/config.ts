/** 协同服务的运行时配置。全部来自环境变量，启动时一次性校验。 */
export type CollabConfig = {
  host: string;
  port: number;
  /** 与 Next BFF 签发协同令牌所用的同一个 HMAC 密钥。 */
  tokenSecret: string;
  /**
   * 本地持久化目录。服务端落库模式下用作应急落盘目录（`<dir>/spool`）；
   * 为 null 时不应急落盘。
   */
  persistenceDir: string | null;
  /**
   * 允许发起 WebSocket 握手的页面来源。空数组表示不校验 Origin，
   * 仅用于没有浏览器参与的本地脚本联调。
   */
  allowedOrigins: string[];
  /** 服务端落库总开关：打开后由协同服务把房间内容写回 MySQL，客户端不再保存。 */
  serverPersist: boolean;
  /** note 服务地址（容器网络直连，不经网关）；服务端落库模式必填。 */
  noteServiceUrl: string | null;
  /** 调用 note 内部端点的 HMAC 密钥，与 note 服务的 `anynote.internal.secret` 一致；服务端落库模式必填。 */
  internalSecret: string | null;
  /** 最后一次更新后的写库静默期。 */
  storeDebounceMs: number;
  /** 距首次变脏的最长写库等待。 */
  storeMaxDebounceMs: number;
  /** 外部写入通知的 Redis 地址；为 null 时不订阅，只靠写库时的原子比较发现外部写入。 */
  redisUrl: string | null;
};

/** 密钥太短时 HMAC 强度不足，直接拒绝启动而不是留个弱口令在线上。 */
const MIN_SECRET_LENGTH = 16;

function readPort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 1234;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`COLLAB_PORT 不是合法端口：${raw}`);
  }
  return port;
}

function readOrigins(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function readFlag(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  return value === "true" || value === "1";
}

function readDuration(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 100 || value > 600_000) {
    throw new Error(`${name} 必须是 100–600000 之间的整数毫秒：${raw}`);
  }
  return value;
}

function readOptional(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value ? value : null;
}

export function readConfig(source: NodeJS.ProcessEnv): CollabConfig {
  const secret = source.COLLAB_TOKEN_SECRET?.trim() ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`COLLAB_TOKEN_SECRET 缺失或长度不足 ${MIN_SECRET_LENGTH} 字符`);
  }

  const serverPersist = readFlag(source.COLLAB_SERVER_PERSIST);
  const noteServiceUrl = readOptional(source.NOTE_SERVICE_URL);
  const internalSecret = readOptional(source.ANYNOTE_INTERNAL_SECRET);
  if (serverPersist) {
    if (!noteServiceUrl) {
      throw new Error("COLLAB_SERVER_PERSIST 已打开，但缺少 NOTE_SERVICE_URL");
    }
    if (!internalSecret || internalSecret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `COLLAB_SERVER_PERSIST 已打开，但 ANYNOTE_INTERNAL_SECRET 缺失或长度不足 ${MIN_SECRET_LENGTH} 字符`,
      );
    }
  }
  const storeDebounceMs = readDuration(
    "COLLAB_STORE_DEBOUNCE_MS",
    source.COLLAB_STORE_DEBOUNCE_MS,
    2_000,
  );
  const storeMaxDebounceMs = readDuration(
    "COLLAB_STORE_MAX_DEBOUNCE_MS",
    source.COLLAB_STORE_MAX_DEBOUNCE_MS,
    10_000,
  );
  if (storeMaxDebounceMs < storeDebounceMs) {
    throw new Error("COLLAB_STORE_MAX_DEBOUNCE_MS 不能小于 COLLAB_STORE_DEBOUNCE_MS");
  }

  return {
    host: source.COLLAB_HOST?.trim() || "0.0.0.0",
    port: readPort(source.COLLAB_PORT),
    tokenSecret: secret,
    persistenceDir: readOptional(source.COLLAB_PERSISTENCE_DIR),
    allowedOrigins: readOrigins(source.COLLAB_ALLOWED_ORIGINS),
    serverPersist,
    noteServiceUrl,
    internalSecret,
    storeDebounceMs,
    storeMaxDebounceMs,
    redisUrl: readOptional(source.COLLAB_REDIS_URL),
  };
}
