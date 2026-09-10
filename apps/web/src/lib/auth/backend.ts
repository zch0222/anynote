import "server-only";
import { env } from "@/lib/env";
import type { paths } from "@anynote/api-client/src/auth";
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
