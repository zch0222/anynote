/** 协同服务的运行时配置。全部来自环境变量，启动时一次性校验。 */
export type CollabConfig = {
  host: string;
  port: number;
  /** 与 Next BFF 签发协同令牌所用的同一个 HMAC 密钥。 */
  tokenSecret: string;
  /** LevelDB 持久化目录；为 null 时文档只存在内存里（进程退出即丢）。 */
  persistenceDir: string | null;
  /**
   * 允许发起 WebSocket 握手的页面来源。空数组表示不校验 Origin，
   * 仅用于没有浏览器参与的本地脚本联调。
   */
  allowedOrigins: string[];
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

export function readConfig(source: NodeJS.ProcessEnv): CollabConfig {
  const secret = source.COLLAB_TOKEN_SECRET?.trim() ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`COLLAB_TOKEN_SECRET 缺失或长度不足 ${MIN_SECRET_LENGTH} 字符`);
  }

  const persistenceDir = source.COLLAB_PERSISTENCE_DIR?.trim();

  return {
    host: source.COLLAB_HOST?.trim() || "0.0.0.0",
    port: readPort(source.COLLAB_PORT),
    tokenSecret: secret,
    persistenceDir: persistenceDir ? persistenceDir : null,
    allowedOrigins: readOrigins(source.COLLAB_ALLOWED_ORIGINS),
  };
}
