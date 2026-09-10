import { z } from "zod";

/** 业务统一的失败类型：HTTP 状态、后端错误码与可选的链路追踪 ID。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly traceId: string | undefined;

  constructor(status: number, code: string, message: string, traceId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.traceId = traceId;
  }
}

const envelopeSchema = z.object({
  code: z.string().min(1),
  msg: z.string().optional(),
  data: z.unknown().optional(),
});

/**
 * 拆 ResData 信封：HTTP 失败或 code !== "00000" 一律抛 ApiError，
 * 成功时用调用方的 schema 校验 data。traceId 透传网关响应头（如存在）。
 */
export async function unwrapEnvelope<T>(
  response: Response,
  parse: (data: unknown) => T,
): Promise<T> {
  const body = await response.json().catch(() => null);
  const parsed = envelopeSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(response.status, "B0500", "服务响应格式异常");
  }
  if (!response.ok || parsed.data.code !== "00000") {
    const traceId = response.headers.get("x-trace-id") ?? response.headers.get("trace-id");
    throw new ApiError(
      response.status,
      parsed.data.code,
      parsed.data.msg ?? "请求失败",
      traceId ?? undefined,
    );
  }
  try {
    return parse(parsed.data.data);
  } catch {
    throw new ApiError(response.status, "B0500", "服务响应数据异常");
  }
}
