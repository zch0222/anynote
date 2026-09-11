import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  INTERNAL_API_URL: z.string().url().default("http://localhost:8080"),
  /**
   * 签发协同令牌的 HMAC 密钥，必须与 `apps/collab` 的 `COLLAB_TOKEN_SECRET` 一致。
   * 默认值与 infra/docker-compose.yaml 的默认值对齐，生产部署必须覆盖。
   */
  COLLAB_TOKEN_SECRET: z.string().min(16).default("anynote-collab-dev-secret"),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  /** 浏览器连协同服务的地址；容器化部署时应指向 Nginx 上的 ws 反代路径。 */
  NEXT_PUBLIC_COLLAB_WS_URL: z.string().url().default("ws://localhost:1234"),
});

const processEnv = {
  NODE_ENV: process.env.NODE_ENV,
  INTERNAL_API_URL: process.env.INTERNAL_API_URL,
  COLLAB_TOKEN_SECRET: process.env.COLLAB_TOKEN_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_COLLAB_WS_URL: process.env.NEXT_PUBLIC_COLLAB_WS_URL,
} as const;

const isServer = typeof window === "undefined";
const schema = isServer ? serverSchema.merge(clientSchema) : clientSchema;
const parsed = schema.safeParse(processEnv);

if (!parsed.success) {
  console.error("❌ Invalid env vars:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid env vars");
}

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

export const env = parsed.data as ServerEnv & ClientEnv;
