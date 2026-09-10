import { ApiError } from "@/lib/api/errors";
import { z } from "zod";

/**
 * AI 域 SSE 流式端点的统一消费层。
 *
 * 后端（services/ai ChatController / RagController）的 SSE 事件格式为
 * `data: {"code":"00000","msg":"...","data":{"status":"success","message":"<增量>","conversationId":1}}`，
 * 本模块负责：POST + JSON 请求体（GET EventSource 无法携带）、经 BFF 代理、
 * 信封拆包与逐 chunk 回调。聊天补全（/chat/completions）与文档 RAG
 * （/rag/query/docs/v1）共用同一套 chunk 结构。
 */

export const aiStreamChunkSchema = z.object({
  status: z.string(),
  message: z.string().nullish(),
  conversationId: z.number().nullish(),
});
export type AiStreamChunk = z.infer<typeof aiStreamChunkSchema>;

const sseEnvelopeSchema = z.object({
  code: z.string().min(1),
  msg: z.string().optional(),
  data: z.unknown().optional(),
});

/**
 * 解码一条 SSE `data:` 载荷。信封 code !== "00000" 或结构异常直接抛 ApiError
 * （由调用方终止流），成功时返回业务 chunk。
 */
export function decodeAiSseData(raw: string): AiStreamChunk {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ApiError(200, "B0500", "AI 响应格式异常");
  }
  const envelope = sseEnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new ApiError(200, "B0500", "AI 响应格式异常");
  }
  if (envelope.data.code !== "00000") {
    throw new ApiError(200, envelope.data.code, envelope.data.msg ?? "AI 请求失败");
  }
  const chunk = aiStreamChunkSchema.safeParse(envelope.data.data);
  if (!chunk.success) {
    throw new ApiError(200, "B0500", "AI 响应数据异常");
  }
  return chunk.data;
}

export type StreamAiSseOptions = {
  /** ai 域内的路径，如 "/chat/completions"。 */
  path: string;
  body: unknown;
  signal: AbortSignal;
  onChunk: (chunk: AiStreamChunk) => void;
};

/**
 * 消费一条 AI SSE 流直到结束。失败时 reject（HTTP 错误、非 SSE 响应、
 * 信封业务错误码或网络中断），不自动重试——流式对话的重试语义交给用户。
 */
export async function streamAiSse({
  path,
  body,
  signal,
  onChunk,
}: StreamAiSseOptions): Promise<void> {
  const { fetchEventSource } = await import("@microsoft/fetch-event-source");
  // ai 域走 /api/proxy/aiNio：Gateway 上 /api/aiNio/** 才路由到 anynote-ai-nio
  await fetchEventSource(`/api/proxy/aiNio${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
    // 切后台 / 切路由不中断（store 层持有流，消息不丢）。
    openWhenHidden: true,
    async onopen(response) {
      if (!response.ok) {
        throw new ApiError(response.status, "A0500", `AI 服务请求失败（${response.status}）`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        throw new ApiError(response.status, "B0500", "AI 服务响应类型异常");
      }
    },
    onmessage(event) {
      if (!event.data) {
        return;
      }
      onChunk(decodeAiSseData(event.data));
    },
    // 抛出以终止，fetchEventSource 默认的自动重连对对话流没有意义。
    onerror(error) {
      throw error;
    },
  });
}

/** AI 续写的上下文窗口：只带光标前最近的一截正文，避免把整篇笔记塞进 prompt。 */
export const AI_CONTINUE_CONTEXT_CHARS = 2000;

export function buildContinuePrompt(contextTail: string): string {
  const tail = contextTail.slice(-AI_CONTINUE_CONTEXT_CHARS);
  return [
    "请接着下面的笔记内容继续写作：保持原文的语言、语气与 Markdown 风格，",
    "直接输出后续内容，不要重复已有内容，不要任何解释与额外说明。",
    "",
    "---",
    tail,
  ].join("\n");
}

export type ContinueWritingOptions = {
  /** 光标前的正文（调用方负责截取尾部）。 */
  contextTail: string;
  model?: string | undefined;
  onDelta: (delta: string) => void;
  signal: AbortSignal;
};

/** Slash 菜单「AI 续写」的底层实现：把上下文发给 chat/completions，逐增量回调。 */
export async function continueWriting({
  contextTail,
  model,
  onDelta,
  signal,
}: ContinueWritingOptions): Promise<void> {
  await streamAiSse({
    path: "/chat/completions",
    body: { prompt: buildContinuePrompt(contextTail), model },
    signal,
    onChunk: (chunk) => {
      if (chunk.message) {
        onDelta(chunk.message);
      }
    },
  });
}
