"use client";

import { type Citation, parseCitations } from "@/lib/ai/citations";
import { runProgress } from "@/lib/ai/run-progress";
import { streamAiSse, toAiRunErrorMessage } from "@/lib/ai/sse";
import { type StoreApi, type UseBoundStore, create } from "zustand";
import {
  type AnswerNotice,
  type ChatMessage,
  type RunScope,
  answerNoticeSchema,
  runScopeSchema,
} from "./schemas";

/**
 * AI 流式会话的状态层（聊天 / Chat PDF 共用）。
 *
 * 流式引擎挂在进程级 store 而非组件状态：流式进行中切换路由（组件卸载）
 * 消息与流都不丢，回到页面时按 key 恢复——对应 M7.5「中途切页不丢消息」。
 * 会话持久化在后端，store 只承载浏览器会话内的活跃流。
 */

export type ChatStreamStatus = "idle" | "streaming" | "error";

export type StreamMessage = {
  id: string;
  /** 0 用户 / 1 助手，与后端 ChatMessage.role 口径一致。 */
  role: 0 | 1;
  content: string;
  /** 助手消息仍在接收增量。 */
  streaming?: boolean;
  runId?: string | null;
  citations?: Citation[];
  answerNotices?: AnswerNotice[];
  outcome?: string | null;
  progress?: string;
};

export type ChatSession = {
  messages: StreamMessage[];
  status: ChatStreamStatus;
  error: string | null;
  conversationId: number | null;
  scope?: RunScope;
};

export type SendArgs = {
  /** 会话在 store 中的 key：聊天用 conversationKey()，Chat PDF 用 docKey()。 */
  key: string;
  prompt: string;
  /** 已有会话 id；新会话不传，完成后经 onConversationCreated 回填。 */
  conversationId?: number;
  /** 传入时走单资料范围的 Agent 运行端点。 */
  docId?: number;
  model?: string;
  scope?: RunScope;
  /** 新会话首条消息收到 conversationId 时回调（页面据此回填路由）。 */
  onConversationCreated?: (conversationId: number) => void;
  /** 流结束（成功 / 失败 / 中止）后回调（页面据此刷新会话列表）。 */
  onSettled?: () => void;
};

type ChatStreamState = {
  sessions: Record<string, ChatSession>;
  send: (args: SendArgs) => Promise<void>;
  abort: (key: string) => void;
  /** 打开已有会话时灌入服务端历史；幂等——已有内容的会话不覆盖。 */
  hydrate: (
    key: string,
    messages: ChatMessage[],
    conversationId: number | null,
    scope?: RunScope | null,
  ) => void;
  setScope: (key: string, scope: RunScope) => void;
  /** 新会话拿到 conversationId 后把 "new" 会话迁移到正式 key。 */
  renameKey: (from: string, to: string) => void;
  clear: (key: string) => void;
};

const EMPTY_SESSION: ChatSession = {
  messages: [],
  status: "idle",
  error: null,
  conversationId: null,
};

export function emptySession(): ChatSession {
  return EMPTY_SESSION;
}

function messageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function abortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  return toAiRunErrorMessage(error instanceof Error ? error.message : null);
}

type ActiveRun = {
  key: string;
  controller: AbortController;
  runId: string | null;
  cancelRequested: boolean;
  cancellationSent: boolean;
};

const controllers = new Map<string, ActiveRun>();

type ChatStreamStore = UseBoundStore<StoreApi<ChatStreamState>>;

// 挂进程级单例：dev HMR 与多路由分包下 store 仍全局唯一（与 lib/auth/refresh 同策略）。
const globalScope = globalThis as typeof globalThis & {
  __anynoteChatStreamStore?: ChatStreamStore;
};

function ensureChatStreamStore(): ChatStreamStore {
  if (!globalScope.__anynoteChatStreamStore) {
    globalScope.__anynoteChatStreamStore = create<ChatStreamState>()((set, get) => ({
      sessions: {},

      send: async (args) => {
        if (get().sessions[args.key]?.status === "streaming") {
          return;
        }
        const controller = new AbortController();
        const activeRun: ActiveRun = {
          key: args.key,
          controller,
          runId: null,
          cancelRequested: false,
          cancellationSent: false,
        };
        controllers.set(args.key, activeRun);
        const assistantId = messageId();
        set((current) => {
          const session = current.sessions[activeRun.key] ?? EMPTY_SESSION;
          return {
            sessions: {
              ...current.sessions,
              [activeRun.key]: {
                ...session,
                messages: [
                  ...session.messages,
                  { id: messageId(), role: 0, content: args.prompt },
                  {
                    id: assistantId,
                    role: 1,
                    content: "",
                    streaming: true,
                    progress: "正在准备",
                    citations: [],
                    answerNotices: [],
                  },
                ],
                status: "streaming",
                error: null,
                ...(args.scope ? { scope: args.scope } : {}),
              },
            },
          };
        });

        let failed = false;
        let finished = false;
        try {
          await streamAiSse({
            path: args.docId ? "/rag/query/docs/v1" : "/v1/agent/runs",
            body: args.docId
              ? {
                  prompt: args.prompt,
                  docId: args.docId,
                  ...(args.conversationId ? { conversationId: args.conversationId } : {}),
                  ...(args.model ? { model: args.model } : {}),
                }
              : {
                  input: args.prompt,
                  agent: "knowledge-retrieval",
                  ...(args.conversationId ? { conversationId: args.conversationId } : {}),
                  ...(args.model ? { model: args.model } : {}),
                  ...(args.scope ? { scope: args.scope } : {}),
                },
            signal: controller.signal,
            onEvent: (event) => {
              set((current) => {
                const session = current.sessions[activeRun.key];
                if (!session) return current;
                const scope =
                  event.type === "run.started" ? runScopeSchema.safeParse(event.data.scope) : null;
                return {
                  sessions: {
                    ...current.sessions,
                    [activeRun.key]: {
                      ...session,
                      ...(scope?.success ? { scope: scope.data } : {}),
                      messages: session.messages.map((message) => {
                        if (message.id !== assistantId) return message;
                        const progress = runProgress(event);
                        const citation =
                          event.type === "citation" ? parseCitations([event.data])[0] : undefined;
                        const answerNotices =
                          event.type === "run.finished"
                            ? answerNoticeSchema.array().safeParse(event.data.answerNotices)
                            : null;
                        return {
                          ...message,
                          runId: event.runId,
                          ...(progress ? { progress } : {}),
                          ...(citation
                            ? {
                                citations: parseCitations([...(message.citations ?? []), citation]),
                              }
                            : {}),
                          ...(answerNotices?.success ? { answerNotices: answerNotices.data } : {}),
                          ...(event.type === "run.finished" &&
                          typeof event.data.outcome === "string"
                            ? { outcome: event.data.outcome }
                            : {}),
                        };
                      }),
                    },
                  },
                };
              });
              if (event.type === "run.started") {
                const active = controllers.get(activeRun.key);
                if (active) {
                  active.runId = event.runId;
                  if (
                    typeof event.data.conversationId === "number" &&
                    !get().sessions[activeRun.key]?.conversationId
                  ) {
                    const conversationId = event.data.conversationId;
                    set((current) => {
                      const session = current.sessions[activeRun.key];
                      return session
                        ? {
                            sessions: {
                              ...current.sessions,
                              [activeRun.key]: { ...session, conversationId },
                            },
                          }
                        : current;
                    });
                    args.onConversationCreated?.(conversationId);
                  }
                  if (active.cancelRequested) {
                    sendCancellation(active);
                  }
                }
              }
              if (event.type === "text.delta" && typeof event.data.delta === "string") {
                const delta = event.data.delta;
                set((current) => {
                  const session = current.sessions[activeRun.key];
                  if (!session) {
                    return current;
                  }
                  return {
                    sessions: {
                      ...current.sessions,
                      [activeRun.key]: {
                        ...session,
                        messages: session.messages.map((message) =>
                          message.id === assistantId
                            ? { ...message, content: message.content + delta }
                            : message,
                        ),
                      },
                    },
                  };
                });
              }
              if (event.type === "error") {
                const category = event.data.category;
                if (category !== "CANCELLED") {
                  failed = true;
                  set((current) => {
                    const session = current.sessions[activeRun.key];
                    return session
                      ? {
                          sessions: {
                            ...current.sessions,
                            [activeRun.key]: {
                              ...session,
                              error: toAiRunErrorMessage(event.data.message),
                            },
                          },
                        }
                      : current;
                  });
                }
              }
              if (event.type === "run.finished") {
                finished = true;
                if (event.data.outcome === "FAILED") {
                  failed = true;
                  set((current) => {
                    const session = current.sessions[activeRun.key];
                    return session && !session.error
                      ? {
                          sessions: {
                            ...current.sessions,
                            [activeRun.key]: {
                              ...session,
                              error: toAiRunErrorMessage(null),
                            },
                          },
                        }
                      : current;
                  });
                }
              }
            },
          });
          if (!finished) {
            failed = true;
            set((current) => {
              const session = current.sessions[activeRun.key];
              return session && !session.error
                ? {
                    sessions: {
                      ...current.sessions,
                      [activeRun.key]: { ...session, error: toAiRunErrorMessage(null) },
                    },
                  }
                : current;
            });
          }
        } catch (error) {
          failed = !abortError(error);
          if (failed) {
            set((current) => {
              const session = current.sessions[activeRun.key];
              if (!session) {
                return current;
              }
              return {
                sessions: {
                  ...current.sessions,
                  [activeRun.key]: { ...session, error: errorMessage(error) },
                },
              };
            });
          }
        } finally {
          if (controllers.get(activeRun.key) === activeRun) {
            controllers.delete(activeRun.key);
          }
          set((current) => {
            const session = current.sessions[activeRun.key];
            if (!session) {
              return current;
            }
            return {
              sessions: {
                ...current.sessions,
                [activeRun.key]: {
                  ...session,
                  // 终态事件未提供错误说明时使用已确认的运行失败文案。
                  error: failed && !session.error ? toAiRunErrorMessage(null) : session.error,
                  status: failed ? "error" : "idle",
                  messages: session.messages.map((message) =>
                    message.streaming ? { ...message, streaming: false } : message,
                  ),
                },
              },
            };
          });
          args.onSettled?.();
        }
      },

      abort: (key) => {
        const active = controllers.get(key);
        if (!active) {
          return;
        }
        active.cancelRequested = true;
        if (active.runId) {
          sendCancellation(active);
        }
      },

      setScope: (key, scope) => {
        set((current) => {
          const session = current.sessions[key] ?? EMPTY_SESSION;
          if (session.status === "streaming") return current;
          return { sessions: { ...current.sessions, [key]: { ...session, scope } } };
        });
      },

      hydrate: (key, messages, conversationId, scope) => {
        set((current) => {
          const existing = current.sessions[key];
          if (existing && (existing.status === "streaming" || existing.messages.length > 0)) {
            return current;
          }
          return {
            sessions: {
              ...current.sessions,
              [key]: {
                messages: messages
                  .filter((message) => message.role === 0 || message.role === 1)
                  .map((message) => ({
                    id: String(message.id ?? messageId()),
                    role: message.role as 0 | 1,
                    content: message.content ?? "",
                    ...(message.runId ? { runId: message.runId } : {}),
                    citations: parseCitations(message.citations),
                    answerNotices: message.answerNotices ?? [],
                    ...(message.outcome ? { outcome: message.outcome } : {}),
                  })),
                status: "idle",
                error: null,
                conversationId,
                ...(scope ? { scope } : {}),
              },
            },
          };
        });
      },

      renameKey: (from, to) => {
        if (from === to) {
          return;
        }
        const active = controllers.get(from);
        if (active) {
          controllers.delete(from);
          active.key = to;
          controllers.set(to, active);
        }
        set((current) => {
          const session = current.sessions[from];
          if (!session) {
            return current;
          }
          const sessions = { ...current.sessions };
          delete sessions[from];
          sessions[to] = session;
          return { sessions };
        });
      },

      clear: (key) => {
        get().abort(key);
        set((current) => {
          if (!(key in current.sessions)) {
            return current;
          }
          const sessions = { ...current.sessions };
          delete sessions[key];
          return { sessions };
        });
      },
    }));
  }
  return globalScope.__anynoteChatStreamStore;
}

export const useChatStreamStore: ChatStreamStore = ensureChatStreamStore();

function sendCancellation(active: ActiveRun): void {
  if (!active.runId || active.cancellationSent) {
    return;
  }
  active.cancellationSent = true;
  void cancelAgentRun(active.runId).catch(() => {
    active.cancellationSent = false;
  });
}

async function cancelAgentRun(runId: string): Promise<void> {
  const { aiApi } = await import("@/lib/api/openapi");
  const result = await aiApi.POST("/v1/agent/runs/{runId}/cancel", {
    params: { path: { runId } },
  });
  if (result.error) {
    throw new Error("Agent run cancellation failed");
  }
}

/** 订阅单个会话（不存在的 key 返回稳定的空会话，避免无限重渲染）。 */
export function useChatSession(key: string): ChatSession {
  return useChatStreamStore((state) => state.sessions[key] ?? EMPTY_SESSION);
}

/** Chat PDF 会话在 store 中的 key（每个文档独立会话）。 */
export function docSessionKey(docId: number): string {
  return `doc${docId}`;
}
