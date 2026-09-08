import { registerSchema } from "@/features/auth/schemas";
import { authClient } from "@/lib/auth/backend";
import { createSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  return createSession(request, registerSchema, ({ email, ...body }) =>
    authClient.POST("/register", {
      body: { ...body, ...(email === undefined ? {} : { email }) },
      signal: AbortSignal.timeout(10_000),
    }),
  );
}
