import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Compose 开发环境也运行生产构建，部署模式不能只看 NODE_ENV。 */
  DEPLOYMENT_ENV: z.enum(["development", "production"]).optional(),
  INTERNAL_API_URL: z.string().url().default("http://localhost:8080"),
  /**
   * 签发协同令牌的 HMAC 密钥，必须与 `apps/collab` 的 `COLLAB_TOKEN_SECRET` 一致。
   * 默认值与 infra/docker-compose.yaml 的默认值对齐，生产部署必须覆盖。
   */
  COLLAB_TOKEN_SECRET: z.string().min(16).default("anynote-collab-dev-secret"),
  /**
   * 桌面端令牌交换的客户端密钥。**不配置即关闭该端点**——纯 Web 部署必须保持关闭，
   * 因为 /api/auth/exchange 会把真实 Token 交给 JS，开着等于给 XSS 留了取 Token 的口子。
   */
  DESKTOP_EXCHANGE_KEY: z.string().min(16).optional(),
  /** 允许调用令牌交换的来源（逗号分隔）。Tauri 2 的 webview 来源见 apps/desktop/README.md。 */
  DESKTOP_ALLOWED_ORIGINS: z
    .string()
    .default("tauri://localhost,http://tauri.localhost,https://tauri.localhost"),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  /** 浏览器连协同服务的地址；容器化部署时应指向 Nginx 上的 ws 反代路径。 */
  NEXT_PUBLIC_COLLAB_WS_URL: z.string().url().default("ws://localhost:1234"),
});

const processEnv = {
  NODE_ENV: process.env.NODE_ENV,
  DEPLOYMENT_ENV: process.env.DEPLOYMENT_ENV,
  INTERNAL_API_URL: process.env.INTERNAL_API_URL,
  COLLAB_TOKEN_SECRET: process.env.COLLAB_TOKEN_SECRET,
  DESKTOP_EXCHANGE_KEY: process.env.DESKTOP_EXCHANGE_KEY,
  DESKTOP_ALLOWED_ORIGINS: process.env.DESKTOP_ALLOWED_ORIGINS,
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
