import "server-only";
import { env } from "@/lib/env";
import type { paths } from "@anynote/api-client/src/auth";
import type { paths as NotePaths } from "@anynote/api-client/src/note";
import type { paths as SystemPaths } from "@anynote/api-client/src/system";
import createClient from "openapi-fetch";

const baseUrl = `${env.INTERNAL_API_URL.replace(/\/$/, "")}/api`;

export const authClient = createClient<paths>({
  baseUrl: `${baseUrl}/auth`,
  cache: "no-store",
  redirect: "error",
});

export const systemClient = createClient<SystemPaths>({
  baseUrl: `${baseUrl}/system`,
  cache: "no-store",
  redirect: "error",
});

/**
 * 笔记服务的**服务端**客户端（BFF 专用）。
 *
 * 与浏览器侧的 `@/lib/api/openapi` 不同：那条走 `/api/proxy/note`（Cookie → Bearer），
 * 这条直连 Gateway 并自带 Authorization 头。只有需要「以当前会话身份调一次后端、
 * 但结果不直接回给浏览器」的 BFF 路由用它——目前是 `/api/auth/collab-token`
 * 里的 `GET /notes/{id}/collab-grant`。
 */
export const noteClient = createClient<NotePaths>({
  baseUrl: `${baseUrl}/note`,
  cache: "no-store",
  redirect: "error",
});
