import { ApiError } from "@/lib/api/errors";
import { z } from "zod";

/**
 * AI Agent 运行 SSE 流的统一消费层。
 */

export const aiRunEventSchema = z.object({
  seq: z.number().int().positive(),
  runId: z.string().min(1),
  ts: z.string().min(1),
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});
export type AiRunEvent = z.infer<typeof aiRunEventSchema>;

const AI_RUN_ERROR_MESSAGES = new Set([
  "服务暂时不可用，请稍后重试",
  "当前使用人数较多，请稍后再试",
  "今日 AI 问答次数已达上限，请明天再试。",
]);
const AI_RUN_UNAVAILABLE_MESSAGE = "服务暂时不可用，请稍后重试";

/** 仅返回已确认的 Agent 运行错误文案。 */
export function toAiRunErrorMessage(value: unknown): string {
  return typeof value === "string" && AI_RUN_ERROR_MESSAGES.has(value)
    ? value
    : AI_RUN_UNAVAILABLE_MESSAGE;
}
const errorEnvelopeSchema = z.object({
  code: z.string().optional(),
  msg: z.string().optional(),
});

/**
 * 解码一条 SSE `data:` 载荷。
 */
export function decodeAiSseData(raw: string): AiRunEvent {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ApiError(200, "B0500", AI_RUN_UNAVAILABLE_MESSAGE);
  }
  const event = aiRunEventSchema.safeParse(json);
  if (!event.success) {
    throw new ApiError(200, "B0500", AI_RUN_UNAVAILABLE_MESSAGE);
  }
  return event.data;
}

export type StreamAiSseOptions = {
  /** ai 域内的 Agent 运行路径。 */
  path: string;
  body: unknown;
  signal: AbortSignal;
  onEvent: (event: AiRunEvent) => void;
};

/**
 * 消费一条 AI SSE 流直到结束。失败时 reject（HTTP 错误、非 SSE 响应、
 * 事件结构异常或网络中断），不自动重试——运行重试语义交给用户。
 */
export async function streamAiSse({
  path,
  body,
  signal,
  onEvent,
}: StreamAiSseOptions): Promise<void> {
  const { fetchEventSource } = await import("@microsoft/fetch-event-source");
  // ai 域走 /api/proxy/ai：M16.1 改名后 Gateway 上 /api/ai/** 才路由到 anynote-ai
  await fetchEventSource(`/api/proxy/ai${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
    // 切后台 / 切路由不中断（store 层持有流，消息不丢）。
    openWhenHidden: true,
    async onopen(response) {
      if (!response.ok) {
        const payload = await response
          .clone()
          .json()
          .catch(() => null);
        const envelope = errorEnvelopeSchema.safeParse(payload);
        throw new ApiError(
          response.status,
          envelope.success ? envelope.data.code ?? "A0500" : "A0500",
          toAiRunErrorMessage(envelope.success ? envelope.data.msg : null),
        );
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        throw new ApiError(response.status, "B0500", AI_RUN_UNAVAILABLE_MESSAGE);
      }
    },
    onmessage(message) {
      if (!message.data) {
        return;
      }
      const event = decodeAiSseData(message.data);
      if (message.event && message.event !== event.type) {
        throw new ApiError(200, "B0500", AI_RUN_UNAVAILABLE_MESSAGE);
      }
      if (message.id && message.id !== String(event.seq)) {
        throw new ApiError(200, "B0500", AI_RUN_UNAVAILABLE_MESSAGE);
      }
      onEvent(event);
    },
    // 抛出以终止，fetchEventSource 默认的自动重连对对话流没有意义。
    onerror(error) {
      throw error;
    },
  });
}
