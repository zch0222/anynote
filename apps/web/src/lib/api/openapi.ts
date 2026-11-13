import type { paths } from "@anynote/api-client/src/ai";
import type { paths as AuthPaths } from "@anynote/api-client/src/auth";
import type { paths as FilePaths } from "@anynote/api-client/src/file";
import type { paths as NotePaths } from "@anynote/api-client/src/note";
import type { paths as NotifyPaths } from "@anynote/api-client/src/notify";
import type { paths as SystemPaths } from "@anynote/api-client/src/system";
import createClient from "openapi-fetch";

// 浏览器业务请求统一经 BFF 代理：Cookie 由服务端换成 Bearer，401 自动刷新并重放，
// 浏览器侧无需任何 401 处理逻辑。分域前缀与 Gateway 路由一一对应。
// ai 域（anynote-ai 服务，M16.1 由 anynote-ai-nio 改名）的 Gateway 路由前缀是 /api/ai；
// 旧 /api/aiNio/** 路由已随改名删除，不保留别名。
function proxyClient<Paths extends {}>(domain: string) {
  return createClient<Paths>({ baseUrl: `/api/proxy/${domain}`, credentials: "same-origin" });
}

export const aiApi = proxyClient<paths>("ai");
export const authApi = proxyClient<AuthPaths>("auth");
export const fileApi = proxyClient<FilePaths>("file");
export const noteApi = proxyClient<NotePaths>("note");
export const notifyApi = proxyClient<NotifyPaths>("notify");
export const systemApi = proxyClient<SystemPaths>("system");
