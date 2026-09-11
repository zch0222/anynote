export function validateContainerConfig(source, built) {
  const mode = source.DEPLOYMENT_ENV ?? "production";
  if (!["production", "development"].includes(mode)) throw new Error("DEPLOYMENT_ENV 无效");
  for (const key of ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_COLLAB_WS_URL"]) {
    if (source[key] !== built[key]) throw new Error(`${key} 与镜像不一致，请重新构建`);
  }
  const origin = new URL(source.NEXT_PUBLIC_APP_URL);
  const ws = new URL(source.NEXT_PUBLIC_COLLAB_WS_URL);
  const gateway = new URL(source.INTERNAL_API_URL);
  if (!["http:", "https:"].includes(gateway.protocol))
    throw new Error("INTERNAL_API_URL 必须是 HTTP(S)");
  if (source.DESKTOP_EXCHANGE_KEY) throw new Error("Web 容器不能配置 DESKTOP_EXCHANGE_KEY");
  if ((source.COLLAB_TOKEN_SECRET?.trim().length ?? 0) < (mode === "production" ? 32 : 16)) {
    throw new Error("COLLAB_TOKEN_SECRET 缺失或太短");
  }
  if (mode === "production") {
    if (source.NEXT_PUBLIC_APP_URL !== origin.origin || origin.protocol !== "https:") {
      throw new Error("NEXT_PUBLIC_APP_URL 必须是无路径的 HTTPS 来源");
    }
    if (
      ws.protocol !== "wss:" ||
      ws.host !== origin.host ||
      ws.pathname !== "/collab" ||
      ws.search ||
      ws.hash ||
      ws.username ||
      ws.password
    ) {
      throw new Error("NEXT_PUBLIC_COLLAB_WS_URL 必须为同源 wss://域名/collab");
    }
  }
}
