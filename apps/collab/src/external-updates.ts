import { Redis } from "ioredis";

/** note 服务发布外部写入通知的频道前缀，完整频道为 `collab:note-updated:<noteId>`。 */
export const EXTERNAL_UPDATE_CHANNEL_PREFIX = "collab:note-updated:";

/** 外部写入通知源：每收到一条通知回调一次被写入的笔记 id。 */
export type ExternalUpdateSource = {
  subscribe(onUpdate: (noteId: number) => void): { close(): Promise<void> };
};

/**
 * 从频道名取笔记 id；不是本前缀或 id 非法时返回 null。
 *
 * @param channel Redis 频道名
 */
export function parseExternalUpdateChannel(channel: string): number | null {
  if (!channel.startsWith(EXTERNAL_UPDATE_CHANNEL_PREFIX)) return null;
  const raw = channel.slice(EXTERNAL_UPDATE_CHANNEL_PREFIX.length);
  if (!/^[1-9][0-9]{0,18}$/.test(raw)) return null;
  const noteId = Number(raw);
  return Number.isSafeInteger(noteId) ? noteId : null;
}

/**
 * 基于 Redis 模式订阅的外部写入通知源。
 *
 * 通知只用于加速合并：连接断开、消息丢失都不影响正确性，写库时的原子比较仍会发现外部写入。
 *
 * @param url Redis 连接地址，例如 `redis://:password@redis:6379`
 * @param onError 连接与订阅错误的上报口子
 */
export function createRedisExternalUpdates(
  url: string,
  onError: (error: unknown) => void,
): ExternalUpdateSource {
  return {
    subscribe(onUpdate) {
      const client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: null });
      client.on("error", onError);
      client.on("pmessage", (_pattern: string, channel: string) => {
        const noteId = parseExternalUpdateChannel(channel);
        if (noteId !== null) onUpdate(noteId);
      });
      void client.psubscribe(`${EXTERNAL_UPDATE_CHANNEL_PREFIX}*`).catch(onError);
      return {
        async close() {
          await client.quit().catch(() => client.disconnect());
        },
      };
    },
  };
}
