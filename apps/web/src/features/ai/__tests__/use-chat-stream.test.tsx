import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// streamAiSse 的行为在 sse.test.ts / 集成测试覆盖；这里 mock 掉网络层，
// 专注 store 状态机（乐观追加、累积、回填、中止、错误）。
const streamAiSseMock =
  vi.fn<
    (options: {
      path: string;
      body: unknown;
      signal: AbortSignal;
      onChunk: (chunk: {
        status: string;
        message?: string | null;
        conversationId?: number | null;
      }) => void;
    }) => Promise<void>
  >();
vi.mock("@/lib/ai/sse", () => ({
  streamAiSse: (options: Parameters<typeof streamAiSseMock>[0]) => streamAiSseMock(options),
  continueWriting: vi.fn(),
  buildContinuePrompt: vi.fn(),
}));

import { docSessionKey, useChatSession, useChatStreamStore } from "@/features/ai/use-chat-stream";

function renderSession(key: string) {
  return renderHook(() => useChatSession(key));
}

async function flush() {
  await Promise.resolve();
}

describe("chat stream store", () => {
  beforeEach(() => {
    streamAiSseMock.mockReset();
    useChatStreamStore.getState().clear("new");
    useChatStreamStore.getState().clear("c1");
    useChatStreamStore.getState().clear(docSessionKey(9));
  });

  it("send 乐观追加用户消息与空的助手消息，并进入 streaming", async () => {
    streamAiSseMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          // 保持 pending，观察流式中状态
        }),
    );
    const { result } = renderSession("new");
    expect(result.current.messages).toHaveLength(0);

    void useChatStreamStore.getState().send({ key: "new", prompt: "你好" });

    await flush();
    const session = useChatStreamStore.getState().sessions.new;
    expect(session?.status).toBe("streaming");
    expect(session?.messages).toHaveLength(2);
    expect(session?.messages[0]).toMatchObject({ role: 0, content: "你好" });
    expect(session?.messages[1]).toMatchObject({ role: 1, content: "", streaming: true });

    useChatStreamStore.getState().abort("new");
  });

  it("增量 chunk 累积到最后一条助手消息，结束后 streaming 清除", async () => {
    streamAiSseMock.mockImplementation(async ({ onChunk }) => {
      onChunk({ status: "success", message: "你好" });
      onChunk({ status: "success", message: "，世界" });
    });
    await useChatStreamStore.getState().send({ key: "new", prompt: "hi" });

    const session = useChatStreamStore.getState().sessions.new;
    expect(session?.status).toBe("idle");
    expect(session?.messages[1]?.content).toBe("你好，世界");
    expect(session?.messages[1]?.streaming).toBe(false);
  });

  it("新会话首包回填 conversationId 并触发 onConversationCreated", async () => {
    streamAiSseMock.mockImplementation(async ({ onChunk }) => {
      onChunk({ status: "success", message: "答", conversationId: 42 });
    });
    const onConversationCreated = vi.fn();
    await useChatStreamStore.getState().send({
      key: "new",
      prompt: "q",
      onConversationCreated,
    });

    expect(onConversationCreated).toHaveBeenCalledWith(42);
    expect(useChatStreamStore.getState().sessions.new?.conversationId).toBe(42);
  });

  it("已有会话时携带 conversationId 走 chat 端点", async () => {
    streamAiSseMock.mockImplementation(async () => {});
    await useChatStreamStore.getState().send({
      key: "c1",
      prompt: "继续",
      conversationId: 7,
      model: "deepseek_gpt-4o-mini",
    });
    expect(streamAiSseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/chat/completions",
        body: { prompt: "继续", conversationId: 7, model: "deepseek_gpt-4o-mini" },
      }),
    );
  });

  it("带 docId 时走文档 RAG 端点", async () => {
    streamAiSseMock.mockImplementation(async () => {});
    await useChatStreamStore.getState().send({
      key: docSessionKey(9),
      prompt: "这篇文档讲了什么",
      docId: 9,
    });
    expect(streamAiSseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/rag/query/docs/v1",
        body: { prompt: "这篇文档讲了什么", docId: 9 },
      }),
    );
  });

  it("失败 chunk 置 error 状态；网络异常同样置 error 并保留已收内容", async () => {
    streamAiSseMock.mockImplementation(async ({ onChunk }) => {
      onChunk({ status: "failed", message: null });
    });
    await useChatStreamStore.getState().send({ key: "new", prompt: "q" });
    expect(useChatStreamStore.getState().sessions.new?.status).toBe("error");

    streamAiSseMock.mockRejectedValue(new Error("boom"));
    await useChatStreamStore.getState().send({ key: "new", prompt: "q2" });
    const session = useChatStreamStore.getState().sessions.new;
    expect(session?.status).toBe("error");
    expect(session?.error).toBe("boom");
  });

  it("abort 中止不算错误，保留已收内容并回到 idle", async () => {
    streamAiSseMock.mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const pending = useChatStreamStore.getState().send({ key: "new", prompt: "长问题" });
    const assistantId = useChatStreamStore.getState().sessions.new?.messages[1]?.id;
    streamAiSseMock.mock.calls[0]?.[0].onChunk({ status: "success", message: "部分" });
    useChatStreamStore.getState().abort("new");
    await pending;

    const session = useChatStreamStore.getState().sessions.new;
    expect(session?.status).toBe("idle");
    expect(session?.error).toBeNull();
    expect(assistantId).toBeTruthy();
  });

  it("流式进行中重复 send 被忽略", async () => {
    let resolveFirst: (() => void) | undefined;
    streamAiSseMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const first = useChatStreamStore.getState().send({ key: "new", prompt: "q1" });
    await flush();
    // 第二次 send 因 streaming 被忽略，不会追加消息
    await useChatStreamStore.getState().send({ key: "new", prompt: "q2" });
    const messages = useChatStreamStore.getState().sessions.new?.messages;
    expect(messages).toHaveLength(2);
    expect(messages?.[0]?.content).toBe("q1");
    resolveFirst?.();
    await first;
  });

  it("hydrate 灌入服务端历史（role 0/1），幂等不覆盖已有内容", () => {
    const store = useChatStreamStore.getState();
    store.hydrate(
      "c1",
      [
        { id: 1, role: 0, content: "问" },
        { id: 2, role: 1, content: "答" },
        { id: 3, role: 2, content: "system 不展示" },
      ],
      1,
    );
    const session = useChatStreamStore.getState().sessions.c1;
    expect(session?.messages).toHaveLength(2);
    expect(session?.conversationId).toBe(1);

    store.hydrate("c1", [{ id: 9, role: 0, content: "应被忽略" }], 1);
    expect(useChatStreamStore.getState().sessions.c1?.messages).toHaveLength(2);
  });

  it("renameKey 迁移会话（新会话回填场景）且 clear 清空", () => {
    const store = useChatStreamStore.getState();
    store.hydrate("new", [{ id: 1, role: 0, content: "问" }], null);
    store.renameKey("new", "c42");
    expect(useChatStreamStore.getState().sessions.new).toBeUndefined();
    expect(useChatStreamStore.getState().sessions.c42?.messages).toHaveLength(1);

    useChatStreamStore.getState().clear("c42");
    expect(useChatStreamStore.getState().sessions.c42).toBeUndefined();
  });

  it("useChatSession 对不存在的 key 返回稳定空会话", () => {
    const { result, rerender } = renderSession("missing");
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(result.current.status).toBe("idle");
    expect(result.current.messages).toHaveLength(0);
  });
});
