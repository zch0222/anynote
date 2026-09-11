import { readConfig } from "./config.ts";
import { createCollabServer } from "./server.ts";

// 进程入口：只有 `node dist/main.js` 会执行到这里。
// server.ts 保持纯模块（import 无副作用），测试才能自由地起停实例。
const config = readConfig(process.env);
const server = createCollabServer(config);

void server.listen().then(() => {
  console.log(`[collab] 监听 ${config.host}:${config.port}`);
  console.log(
    `[collab] 持久化目录：${config.persistenceDir ?? "（未配置，仅内存）"}；允许来源：${
      config.allowedOrigins.join(", ") || "（不校验）"
    }`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    // 退出前把未落盘的房间刷出去，否则最后一段编辑会丢。
    void server.close().then(() => process.exit(0));
  });
}
