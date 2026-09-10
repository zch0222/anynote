"use client";

import { streamAiSse } from "@/lib/ai/sse";
import { type StoreApi, type UseBoundStore, create } from "zustand";
import type { ChatMessage } from "./schemas";

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
};

export type ChatSession = {
  messages: StreamMessage[];
  status: ChatStreamStatus;
  error: string | null;
  conversationId: number | null;
};

export type SendArgs = {
  /** 会话在 store 中的 key：聊天用 conversationKey()，Chat PDF 用 docKey()。 */
  key: string;
  prompt: string;
  /** 已有会话 id；新会话不传，完成后经 onConversationCreated 回填。 */
  conversationId?: number;
  /** 传入时走文档 RAG 端点（/rag/query/docs/v1）。 */
  docId?: number;
  model?: string;
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
  hydrate: (key: string, messages: ChatMessage[], conversationId: number | null) => void;
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
  return error instanceof Error && error.message ? error.message : "AI 请求失败，请稍后重试";
}

const controllers = new Map<string, AbortController>();

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
        const assistantId = messageId();
        set((current) => {
          const session = current.sessions[args.key] ?? EMPTY_SESSION;
          return {
            sessions: {
              ...current.sessions,
              [args.key]: {
                ...session,
                messages: [
                  ...session.messages,
                  { id: messageId(), role: 0, content: args.prompt },
                  { id: assistantId, role: 1, content: "", streaming: true },
                ],
                status: "streaming",
                error: null,
              },
            },
          };
        });

        const controller = new AbortController();
        controllers.set(args.key, controller);

        let failed = false;
        try {
          await streamAiSse({
            path: args.docId ? "/rag/query/docs/v1" : "/chat/completions",
            body: {
              prompt: args.prompt,
              ...(args.docId ? { docId: args.docId } : {}),
              ...(args.conversationId ? { conversationId: args.conversationId } : {}),
              ...(args.model ? { model: args.model } : {}),
            },
            signal: controller.signal,
            onChunk: (chunk) => {
              if (chunk.status === "failed") {
                failed = true;
              }
              if (chunk.message) {
                const delta = chunk.message;
                set((current) => {
                  const session = current.sessions[args.key];
                  if (!session) {
                    return current;
                  }
                  return {
                    sessions: {
                      ...current.sessions,
                      [args.key]: {
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
              if (chunk.conversationId && !get().sessions[args.key]?.conversationId) {
                const conversationId = chunk.conversationId;
                set((current) => {
                  const session = current.sessions[args.key];
                  if (!session) {
                    return current;
                  }
                  return {
                    sessions: {
                      ...current.sessions,
                      [args.key]: { ...session, conversationId },
                    },
                  };
                });
                args.onConversationCreated?.(conversationId);
              }
            },
          });
        } catch (error) {
          failed = !abortError(error);
          if (failed) {
            set((current) => {
              const session = current.sessions[args.key];
              if (!session) {
                return current;
              }
              return {
                sessions: {
                  ...current.sessions,
                  [args.key]: { ...session, error: errorMessage(error) },
                },
              };
            });
          }
        } finally {
          controllers.delete(args.key);
          set((current) => {
            const session = current.sessions[args.key];
            if (!session) {
              return current;
            }
            return {
              sessions: {
                ...current.sessions,
                [args.key]: {
                  ...session,
                  // 后端 failed 收尾事件不带错误文案时补默认提示，保证 UI 有错误块可渲染
                  error: failed && !session.error ? "AI 服务返回失败，请稍后重试" : session.error,
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
        controllers.get(key)?.abort();
      },

      hydrate: (key, messages, conversationId) => {
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
                  })),
                status: "idle",
                error: null,
                conversationId,
              },
            },
          };
        });
      },

      renameKey: (from, to) => {
        if (from === to) {
          return;
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
        controllers.get(key)?.abort();
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

/** 订阅单个会话（不存在的 key 返回稳定的空会话，避免无限重渲染）。 */
export function useChatSession(key: string): ChatSession {
  return useChatStreamStore((state) => state.sessions[key] ?? EMPTY_SESSION);
}

/** Chat PDF 会话在 store 中的 key（每个文档独立会话）。 */
export function docSessionKey(docId: number): string {
  return `doc${docId}`;
}
