import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BACKEND_URL: z.string().url().default("http://localhost:8080"),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const processEnv = {
  NODE_ENV: process.env.NODE_ENV,
  BACKEND_URL: process.env.BACKEND_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
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
