import "server-only";
import { z } from "zod";
import { setAuthCookies } from "./cookies";
import { authResponse, checkOrigin, readAuthResult, upstreamUnavailable } from "./http";

const sessionSchema = z.object({
  username: z.string().nullish(),
  nickname: z.string().nullish(),
  avatar: z.string().nullish(),
  role: z.string().nullish(),
  token: z.object({ accessToken: z.string().min(1), refreshToken: z.string().min(1) }),
});

export async function createSession<T>(
  request: Request,
  schema: z.ZodType<T>,
  authenticate: (body: T) => Promise<Parameters<typeof readAuthResult>[0]>,
) {
  const forbidden = checkOrigin(request);
  if (forbidden) return forbidden;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return authResponse("A0160", "请求体必须是有效 JSON", null, 400);
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) return authResponse("A0160", "请求参数错误", null, 400);

  try {
    const result = readAuthResult(await authenticate(parsed.data));
    if (result.error) return result.error;

    // 白名单重建响应；token 及后端可能增加的敏感字段均不会进入浏览器 JSON。
    const { token, ...profile } = sessionSchema.parse(result.data);
    const response = authResponse("00000", "操作成功", profile);
    setAuthCookies(response, token);
    return response;
  } catch {
    return upstreamUnavailable();
  }
}
