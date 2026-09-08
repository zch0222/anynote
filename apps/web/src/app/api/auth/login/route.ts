import { loginSchema } from "@/features/auth/schemas";
import { authClient } from "@/lib/auth/backend";
import { createSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  return createSession(request, loginSchema, (body) =>
    authClient.POST("/login", { body, signal: AbortSignal.timeout(10_000) }),
  );
}
