import { readConfig } from "./config.ts";
import { createRedisExternalUpdates } from "./external-updates.ts";
import { createCollabServer } from "./server.ts";

// 进程入口：只有 `node dist/main.js` 会执行到这里。
// server.ts 保持纯模块（import 无副作用），测试才能自由地起停实例。
const config = readConfig(process.env);
const externalUpdates =
  config.serverPersist && config.redisUrl
    ? createRedisExternalUpdates(config.redisUrl, (error) =>
        console.error("[collab] 外部写入通知订阅出错", error),
      )
    : undefined;
const server = createCollabServer(config, externalUpdates ? { externalUpdates } : {});

void server.listen().then(() => {
  console.log(`[collab] 监听 ${config.host}:${config.port}`);
  console.log(
    `[collab] 服务端落库：${config.serverPersist ? `开（${config.noteServiceUrl}）` : "关"}；` +
      `外部写入通知：${externalUpdates ? "订阅中" : "未配置"}；` +
      `允许来源：${config.allowedOrigins.join(", ") || "（不校验）"}`,
  );
});

let closing = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    // 退出前把未写库的房间写回；仍失败的写入应急落盘
    void server.close().then(() => process.exit(0));
  });
}
