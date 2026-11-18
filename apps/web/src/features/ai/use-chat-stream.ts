"use client";

import { type Citation, parseCitations } from "@/lib/ai/citations";
import {
  EMPTY_PROCESS,
  type ProcessResultItem,
  type ProcessState,
  applyRunEvent,
} from "@/lib/ai/process";
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
  /** 运行过程状态（思考、工具行）；hydrate 时从落库 process 恢复。 */
  process?: ProcessState;
  /** 过程区完成后展示的总耗时（毫秒）。 */
  durationMs?: number;
  /** 落库过程视图的隐藏提示（撤权后回放时显示）。 */
  processHiddenNotice?: string;
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
        const startedAtMs = Date.now();
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
                const targetMessage = session.messages.find(
                  (message) => message.id === assistantId,
                );
                const nextProcess = targetMessage
                  ? applyRunEvent(targetMessage.process ?? EMPTY_PROCESS, event)
                  : null;
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
                          ...(nextProcess && nextProcess !== message.process
                            ? { process: nextProcess }
                            : {}),
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
                          ...(event.type === "run.finished"
                            ? { durationMs: Date.now() - startedAtMs }
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
                    ...(() => {
                      const restored = hydrateProcess(message.process);
                      if (!restored) return {};
                      return {
                        process: restored,
                        ...(typeof hydrateDurationMs(message.process) === "number"
                          ? { durationMs: hydrateDurationMs(message.process) }
                          : {}),
                        ...(restored.hidden
                          ? {
                              processHiddenNotice:
                                hydrateHiddenNotice(message.process) ??
                                "部分内容你已无权访问，思考过程已隐藏",
                            }
                          : {}),
                      };
                    })(),
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

/** 落库过程视图恢复为过程状态（只取可展示行；隐藏时空文本行丢弃）。 */
function hydrateProcess(raw: unknown): (ProcessState & { hidden?: boolean }) | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const hidden = record.hidden === true;
  const items = Array.isArray(record.items) ? (record.items as ProcessItemLike[]) : [];
  const mapped: ProcessState["items"] = [];
  for (const entry of items) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    if (item.type === "reasoning" && typeof item.blockId === "string") {
      const text = typeof item.text === "string" ? item.text : "";
      if (hidden && !text) continue;
      mapped.push({
        type: "reasoning",
        blockId: item.blockId,
        text,
        status:
          item.status === "interrupted"
            ? "interrupted"
            : item.status === "streaming"
              ? "streaming"
              : "done",
        durationMs: typeof item.durationMs === "number" ? item.durationMs : undefined,
      });
    } else if (item.type === "note" && typeof item.text === "string") {
      if (hidden && !item.text) continue;
      mapped.push({ type: "note", text: item.text });
    } else if (item.type === "retry") {
      mapped.push({ type: "retry" });
    } else if (
      item.type === "tool" &&
      typeof item.callId === "string" &&
      typeof item.name === "string"
    ) {
      mapped.push({
        type: "tool",
        callId: item.callId,
        name: item.name,
        target:
          typeof item.target === "object" && item.target !== null
            ? {
                label: String((item.target as Record<string, unknown>).label ?? ""),
                resolved: (item.target as Record<string, unknown>).resolved === true,
              }
            : null,
        status: typeof item.status === "string" ? item.status : "SUCCESS",
        durationMs: typeof item.durationMs === "number" ? item.durationMs : undefined,
        result:
          typeof item.result === "object" && item.result !== null
            ? {
                count:
                  typeof (item.result as Record<string, unknown>).count === "number"
                    ? ((item.result as Record<string, unknown>).count as number)
                    : 0,
                items: readResultItems((item.result as Record<string, unknown>).items),
              }
            : undefined,
      });
    }
  }
  if (mapped.length === 0) return null;
  return {
    active: true,
    items: mapped,
    hidden,
  };
}

/** 读取工具结果条目（隐藏复核后仅剩可读条目）。 */
function readResultItems(value: unknown): ProcessResultItem[] {
  if (!Array.isArray(value)) return [];
  const items: ProcessResultItem[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const item: ProcessResultItem = {};
    if (typeof record.ref === "string") item.ref = record.ref;
    if (typeof record.title === "string") item.title = record.title;
    if (typeof record.kbName === "string") item.kbName = record.kbName;
    if (typeof record.locator === "object" && record.locator !== null) {
      item.locator = record.locator as Record<string, unknown>;
    }
    items.push(item);
  }
  return items;
}

/** 落库过程视图的隐藏提示文案。 */
function hydrateHiddenNotice(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const notice = (raw as Record<string, unknown>).hiddenNotice;
  return typeof notice === "string" ? notice : undefined;
}

/** 落库过程视图的总耗时（毫秒）。 */
function hydrateDurationMs(raw: unknown): number | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const durationMs = (raw as Record<string, unknown>).durationMs;
  return typeof durationMs === "number" ? durationMs : undefined;
}

type ProcessItemLike = Record<string, unknown>;
