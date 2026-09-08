import "server-only";
import { env } from "@/lib/env";
import type { paths } from "@anynote/api-client/src/auth";
import createClient from "openapi-fetch";

export const authClient = createClient<paths>({
  baseUrl: `${env.INTERNAL_API_URL.replace(/\/$/, "")}/api/auth`,
  cache: "no-store",
  redirect: "error",
});
