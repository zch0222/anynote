import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** 读取 Java 侧维护的过程视图共享样例（services/ai/src/test/resources/fixtures）。 */
function processFixture(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        "..",
        "..",
        "services",
        "ai",
        "src",
        "test",
        "resources",
        "fixtures",
        name,
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

// streamAiSse 的行为在 sse.test.ts / 集成测试覆盖；这里 mock 掉网络层，
// 专注 store 状态机（乐观追加、事件处理、回填、取消、错误）。
const streamAiSseMock =
  vi.fn<
    (options: {
      path: string;
      body: unknown;
      signal: AbortSignal;
      onEvent: (event: {
        seq: number;
        runId: string;
        ts: string;
        type: string;
        data: Record<string, unknown>;
      }) => void;
    }) => Promise<void>
  >();
const aiApiPostMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/sse", () => ({
  streamAiSse: (options: Parameters<typeof streamAiSseMock>[0]) => streamAiSseMock(options),
  toAiRunErrorMessage: (value: unknown) =>
    value === "当前使用人数较多，请稍后再试" || value === "今日 AI 问答次数已达上限，请明天再试。"
      ? value
      : "服务暂时不可用，请稍后重试",
}));
vi.mock("@/lib/api/openapi", () => ({ aiApi: { POST: aiApiPostMock } }));

import { docSessionKey, useChatSession, useChatStreamStore } from "@/features/ai/use-chat-stream";

function event(type: string, data: Record<string, unknown> = {}, seq = 1) {
  return { seq, runId: "r1", ts: "now", type, data };
}

function completeRun(onEvent: Parameters<typeof streamAiSseMock>[0]["onEvent"]) {
  onEvent(event("run.started", { conversationId: 42 }, 1));
  onEvent(event("run.finished", { outcome: "ANSWERED" }, 2));
}

function renderSession(key: string) {
  return renderHook(() => useChatSession(key));
}

async function flush() {
  await Promise.resolve();
}

describe("chat stream store", () => {
  /** 范围、进度、引用与终态随活跃会话迁移而保留。 */
  it("保存新协议的引用和范围", async () => {
    useChatStreamStore.setState({ sessions: {} });
    streamAiSseMock.mockImplementation(async ({ onEvent }) => {
      onEvent(
        event("run.started", { conversationId: 42, scope: { knowledgeBaseIds: [3], refs: [] } }),
      );
      onEvent(event("tool.started", { callId: "a", name: "kb_search", summary: "检索知识库" }, 2));
      expect(useChatStreamStore.getState().sessions.c42?.messages[1]?.progress).toBe("检索知识库");
      onEvent(event("citation", { index: 1, sourceType: "note", sourceId: "note:5", kbId: 3 }, 3));
      onEvent(event("text.delta", { delta: "答案[1]" }, 4));
      onEvent(event("run.finished", { outcome: "ANSWERED", answerNotices: ["UNSOURCED"] }, 5));
    });
    await useChatStreamStore.getState().send({
      key: "new",
      prompt: "问题",
      scope: { knowledgeBaseIds: [3], refs: [] },
      onConversationCreated: (id) => useChatStreamStore.getState().renameKey("new", `c${id}`),
    });
    expect(streamAiSseMock.mock.calls[0]?.[0].body).toMatchObject({
      scope: { knowledgeBaseIds: [3], refs: [] },
    });
    expect(useChatStreamStore.getState().sessions.c42?.scope).toEqual({
      knowledgeBaseIds: [3],
      refs: [],
    });
    expect(useChatStreamStore.getState().sessions.c42?.messages[1]).toMatchObject({
      runId: "r1",
      outcome: "ANSWERED",
      answerNotices: ["UNSOURCED"],
      citations: [{ index: 1, sourceId: "note:5" }],
    });
  });

  beforeEach(() => {
    streamAiSseMock.mockReset().mockImplementation(async ({ onEvent }) => completeRun(onEvent));
    aiApiPostMock.mockReset().mockResolvedValue({ data: { accepted: true } });
    useChatStreamStore.getState().clear("new");
    useChatStreamStore.getState().clear("c1");
    useChatStreamStore.getState().clear(docSessionKey(9));
  });

  it("send 乐观追加用户消息与空的助手消息，并进入 streaming", async () => {
    let finishStream: (() => void) | undefined;
    streamAiSseMock.mockImplementation(({ onEvent }) => {
      onEvent(event("run.started", {}, 1));
      return new Promise<void>((resolve) => {
        finishStream = () => {
          onEvent(event("run.finished", { outcome: "ANSWERED" }, 2));
          resolve();
        };
      });
    });
    const { result } = renderSession("new");
    expect(result.current.messages).toHaveLength(0);

    const pending = useChatStreamStore.getState().send({ key: "new", prompt: "你好" });

    await flush();
    const session = useChatStreamStore.getState().sessions.new;
    expect(session?.status).toBe("streaming");
    expect(session?.messages).toHaveLength(2);
    expect(session?.messages[0]).toMatchObject({ role: 0, content: "你好" });
    expect(session?.messages[1]).toMatchObject({ role: 1, content: "", streaming: true });

    finishStream?.();
    await pending;
  });

  it("text.delta 累积到助手消息，结束后 streaming 清除", async () => {
    streamAiSseMock.mockImplementation(async ({ onEvent }) => {
      onEvent(event("text.delta", { delta: "你好" }, 1));
      onEvent(event("text.delta", { delta: "，世界" }, 2));
      onEvent(event("run.finished", { outcome: "ANSWERED" }, 3));
    });
    await useChatStreamStore.getState().send({ key: "new", prompt: "hi" });

    const session = useChatStreamStore.getState().sessions.new;
    expect(session?.status).toBe("idle");
    expect(session?.messages[1]?.content).toBe("你好，世界");
    expect(session?.messages[1]?.streaming).toBe(false);
  });

  it("新会话首包回填 conversationId 并触发 onConversationCreated", async () => {
    streamAiSseMock.mockImplementation(async ({ onEvent }) => {
      onEvent(event("run.started", { conversationId: 42 }, 1));
      onEvent(event("text.delta", { delta: "答" }, 2));
      onEvent(event("run.finished", { outcome: "ANSWERED" }, 3));
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

  it("新会话首帧改名后继续追加正文并完成", async () => {
    streamAiSseMock.mockImplementation(async ({ onEvent }) => {
      onEvent(event("run.started", { conversationId: 42 }, 1));
      onEvent(event("text.delta", { delta: "完整回答" }, 2));
      onEvent(event("run.finished", { outcome: "ANSWERED" }, 3));
    });

    await useChatStreamStore.getState().send({
      key: "new",
      prompt: "q",
      onConversationCreated: (id) => useChatStreamStore.getState().renameKey("new", `c${id}`),
    });

    const session = useChatStreamStore.getState().sessions.c42;
    expect(useChatStreamStore.getState().sessions.new).toBeUndefined();
    expect(session?.status).toBe("idle");
    expect(session?.messages[1]).toMatchObject({ content: "完整回答", streaming: false });
  });

  it("新会话首帧改名后失败终态仍结束当前会话", async () => {
    streamAiSseMock.mockImplementation(async ({ onEvent }) => {
      onEvent(event("run.started", { conversationId: 42 }, 1));
      onEvent(
        event("error", { category: "MODEL_UNAVAILABLE", message: "服务暂时不可用，请稍后重试" }, 2),
      );
      onEvent(event("run.finished", { outcome: "FAILED" }, 3));
    });

    await useChatStreamStore.getState().send({
      key: "new",
      prompt: "q",
      onConversationCreated: (id) => useChatStreamStore.getState().renameKey("new", `c${id}`),
    });

    const session = useChatStreamStore.getState().sessions.c42;
    expect(session?.status).toBe("error");
    expect(session?.error).toBe("服务暂时不可用，请稍后重试");
    expect(session?.messages[1]?.streaming).toBe(false);
  });

  it("已有会话时携带 conversationId 走知识检索运行端点", async () => {
    streamAiSseMock.mockImplementation(async ({ onEvent }) => completeRun(onEvent));
    await useChatStreamStore.getState().send({
      key: "c1",
      prompt: "继续",
      conversationId: 7,
      model: "deepseek_gpt-4o-mini",
    });
    expect(streamAiSseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v1/agent/runs",
        body: {
          input: "继续",
          agent: "knowledge-retrieval",
          conversationId: 7,
          model: "deepseek_gpt-4o-mini",
        },
      }),
    );
  });

  it("带 docId 时走单资料范围 Agent 端点", async () => {
    streamAiSseMock.mockImplementation(async ({ onEvent }) => completeRun(onEvent));
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

  it("运行失败事件使用服务端说明；网络异常保留已有内容", async () => {
    streamAiSseMock.mockImplementation(async ({ onEvent }) => {
      onEvent({
        seq: 1,
        runId: "r1",
        ts: "now",
        type: "error",
        data: { category: "INTERNAL", retryable: true, message: "服务暂时不可用，请稍后重试" },
      });
      onEvent({
        seq: 2,
        runId: "r1",
        ts: "now",
        type: "run.finished",
        data: { outcome: "FAILED" },
      });
    });
    await useChatStreamStore.getState().send({ key: "new", prompt: "q" });
    expect(useChatStreamStore.getState().sessions.new?.status).toBe("error");

    streamAiSseMock.mockRejectedValue(new Error("boom"));
    await useChatStreamStore.getState().send({ key: "new", prompt: "q2" });
    const session = useChatStreamStore.getState().sessions.new;
    expect(session?.status).toBe("error");
    expect(session?.error).toBe("服务暂时不可用，请稍后重试");
  });

  it("abort 调用运行取消端点并保留已收内容", async () => {
    let finishStream: (() => void) | undefined;
    streamAiSseMock.mockImplementation(({ onEvent }) => {
      onEvent(event("run.started", { conversationId: 42 }, 1));
      return new Promise<void>((resolve) => {
        finishStream = () => {
          onEvent(event("run.finished", { outcome: "CANCELLED" }, 3));
          resolve();
        };
      });
    });
    const pending = useChatStreamStore.getState().send({ key: "new", prompt: "长问题" });
    const assistantId = useChatStreamStore.getState().sessions.new?.messages[1]?.id;
    streamAiSseMock.mock.calls[0]?.[0].onEvent(event("text.delta", { delta: "部分" }, 2));
    useChatStreamStore.getState().abort("new");
    await vi.waitFor(() => {
      expect(aiApiPostMock).toHaveBeenCalledWith("/v1/agent/runs/{runId}/cancel", {
        params: { path: { runId: "r1" } },
      });
    });
    finishStream?.();
    await pending;

    const session = useChatStreamStore.getState().sessions.new;
    expect(session?.status).toBe("idle");
    expect(session?.error).toBeNull();
    expect(assistantId).toBeTruthy();
  });

  it("取消接口返回错误时允许再次请求取消", async () => {
    let finishStream: (() => void) | undefined;
    aiApiPostMock.mockResolvedValueOnce({ error: { code: "A0301" } });
    streamAiSseMock.mockImplementation(({ onEvent }) => {
      onEvent(event("run.started", {}, 1));
      return new Promise<void>((resolve) => {
        finishStream = () => {
          onEvent(event("run.finished", { outcome: "CANCELLED" }, 2));
          resolve();
        };
      });
    });
    const pending = useChatStreamStore.getState().send({ key: "new", prompt: "q" });

    useChatStreamStore.getState().abort("new");
    await vi.waitFor(() => expect(aiApiPostMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => {
      useChatStreamStore.getState().abort("new");
      expect(aiApiPostMock).toHaveBeenCalledTimes(2);
    });

    finishStream?.();
    await pending;
  });

  it("流式进行中重复 send 被忽略", async () => {
    let resolveFirst: (() => void) | undefined;
    streamAiSseMock.mockImplementation(
      ({ onEvent }) =>
        new Promise<void>((resolve) => {
          onEvent(event("run.started", {}, 1));
          resolveFirst = () => {
            onEvent(event("run.finished", { outcome: "ANSWERED" }, 2));
            resolve();
          };
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

  it("缺少 run.finished 的正常 EOF 按运行失败处理", async () => {
    streamAiSseMock.mockImplementation(async ({ onEvent }) => {
      onEvent(event("run.started", {}, 1));
      onEvent(event("text.delta", { delta: "部分回答" }, 2));
    });

    await useChatStreamStore.getState().send({ key: "new", prompt: "q" });

    const session = useChatStreamStore.getState().sessions.new;
    expect(session?.status).toBe("error");
    expect(session?.error).toBe("服务暂时不可用，请稍后重试");
    expect(session?.messages[1]?.content).toBe("部分回答");
    expect(session?.messages[1]?.outcome).toBe("FAILED");
    expect(session?.messages[1]?.streaming).toBe(false);
  });

  it("用户中止后流在终态事件前结束时记为已停止", async () => {
    let endStream: (() => void) | undefined;
    streamAiSseMock.mockImplementation(({ onEvent }) => {
      onEvent(event("run.started", {}, 1));
      return new Promise<void>((resolve) => {
        endStream = resolve;
      });
    });
    const pending = useChatStreamStore.getState().send({ key: "new", prompt: "q" });
    useChatStreamStore.getState().abort("new");
    endStream?.();
    await pending;

    expect(useChatStreamStore.getState().sessions.new?.messages[1]?.outcome).toBe("CANCELLED");
  });

  it("思考增量按动画帧合并写入，其他事件到来前先写完已缓冲的增量", async () => {
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    let finishStream: (() => void) | undefined;
    streamAiSseMock.mockImplementation(({ onEvent }) => {
      onEvent(event("run.started", {}, 1));
      return new Promise<void>((resolve) => {
        finishStream = () => {
          onEvent(event("run.finished", { outcome: "ANSWERED" }, 9));
          resolve();
        };
      });
    });
    try {
      const pending = useChatStreamStore.getState().send({ key: "new", prompt: "q" });
      const onEvent = streamAiSseMock.mock.calls[0]?.[0].onEvent;
      if (!onEvent) throw new Error("期望事件回调");
      const reasoningText = () => {
        const item = useChatStreamStore.getState().sessions.new?.messages[1]?.process?.items[0];
        return item?.type === "reasoning" ? item.text : undefined;
      };
      onEvent(event("reasoning.delta", { id: "b1", delta: "先" }, 2));
      onEvent(event("reasoning.delta", { id: "b1", delta: "想" }, 3));
      expect(frames).toHaveLength(1);
      expect(reasoningText()).toBeUndefined();

      frames[0]?.(0);
      expect(reasoningText()).toBe("先想");

      onEvent(event("reasoning.delta", { id: "b1", delta: "再想" }, 4));
      onEvent(event("reasoning.finished", { id: "b1", durationMs: 10, status: "done" }, 5));
      const item = useChatStreamStore.getState().sessions.new?.messages[1]?.process?.items[0];
      expect(item).toMatchObject({ type: "reasoning", text: "先想再想", status: "done" });

      finishStream?.();
      await pending;
    } finally {
      raf.mockRestore();
      cancel.mockRestore();
    }
  });

  it("run.finished 带回工具调用次数、首字时间与总耗时", async () => {
    streamAiSseMock.mockImplementation(async ({ onEvent }) => {
      onEvent(event("run.started", {}, 1));
      onEvent(event("tool.started", { id: "c1", name: "kb_search", summary: "检索知识库" }, 2));
      onEvent(
        event(
          "run.finished",
          { outcome: "ANSWERED", toolCalls: 3, firstOutputMs: 1200, durationMs: 4500 },
          3,
        ),
      );
    });

    await useChatStreamStore.getState().send({ key: "new", prompt: "q" });

    expect(useChatStreamStore.getState().sessions.new?.messages[1]).toMatchObject({
      toolCalls: 3,
      firstOutputMs: 1200,
      durationMs: 4500,
      outcome: "ANSWERED",
    });
  });

  it("hydrate 灌入服务端历史（role 0/1），幂等不覆盖已有内容", () => {
    const store = useChatStreamStore.getState();
    store.hydrate(
      "c1",
      [
        { id: 1, role: 0, content: "问", citations: [], answerNotices: [] },
        { id: 2, role: 1, content: "答", citations: [], answerNotices: ["NOT_FROM_KNOWLEDGE"] },
        { id: 3, role: 2, content: "system 不展示", citations: [], answerNotices: [] },
      ],
      1,
    );
    const session = useChatStreamStore.getState().sessions.c1;
    expect(session?.messages).toHaveLength(2);
    expect(session?.messages[1]?.answerNotices).toEqual(["NOT_FROM_KNOWLEDGE"]);
    expect(session?.conversationId).toBe(1);

    store.hydrate(
      "c1",
      [{ id: 9, role: 0, content: "应被忽略", citations: [], answerNotices: [] }],
      1,
    );
    expect(useChatStreamStore.getState().sessions.c1?.messages).toHaveLength(2);
  });

  it("hydrate 恢复落库过程视图：耗时、工具结果条目与完整思考", () => {
    useChatStreamStore.getState().clear("c2");
    useChatStreamStore.getState().hydrate(
      "c2",
      [
        {
          id: 11,
          role: 0,
          content: "问",
          citations: [],
          answerNotices: [],
        },
        {
          id: 12,
          role: 1,
          content: "答",
          citations: [],
          answerNotices: [],
          outcome: "ANSWERED",
          process: {
            version: 1,
            durationMs: 18230,
            hidden: false,
            items: [
              { type: "reasoning", id: "b1", text: "先想想", status: "done", durationMs: 100 },
              {
                type: "tool",
                id: "c1",
                name: "kb_search",
                status: "SUCCESS",
                durationMs: 820,
                target: { label: "期末复习", resolved: true },
                result: {
                  count: 5,
                  items: [{ ref: "note:12", title: "提纲", kbName: "课程库" }],
                },
              },
              { type: "note", id: "n1", text: "先看看目录" },
            ],
          },
        },
      ],
      2,
    );
    const message = useChatStreamStore.getState().sessions.c2?.messages[1];
    expect(message?.process?.items).toHaveLength(3);
    expect(message?.durationMs).toBe(18230);
    expect(message?.processHiddenNotice).toBeUndefined();
    const tool = message?.process?.items[1];
    if (tool?.type !== "tool") throw new Error("期望工具行");
    expect(tool.result?.items[0]?.title).toBe("提纲");
    expect(tool.result?.items).toHaveLength(1);
  });

  it("hydrate 遇到隐藏过程视图时空文本行丢弃并展示已确认提示", () => {
    useChatStreamStore.getState().clear("c3");
    useChatStreamStore.getState().hydrate(
      "c3",
      [
        {
          id: 21,
          role: 1,
          content: "答",
          citations: [],
          answerNotices: [],
          process: {
            version: 1,
            durationMs: 5000,
            hidden: true,
            hiddenNotice: "部分内容你已无权访问，思考过程已隐藏",
            items: [
              { type: "reasoning", id: "b1", status: "done" },
              { type: "note", id: "n1" },
              { type: "retry", id: "r1" },
            ],
          },
        },
      ],
      3,
    );
    const message = useChatStreamStore.getState().sessions.c3?.messages[0];
    expect(message?.processHiddenNotice).toBe("部分内容你已无权访问，思考过程已隐藏");
    // 空文本的思考与说明行丢弃，只剩重试行
    expect(message?.process?.items).toEqual([{ type: "retry", id: "r1" }]);
  });

  it("回放 Java 落库共享样例：四类行与工具行字段全部恢复", () => {
    useChatStreamStore.getState().clear("c4");
    useChatStreamStore.getState().hydrate(
      "c4",
      [
        {
          id: 31,
          role: 1,
          content: "答",
          citations: [],
          answerNotices: [],
          process: processFixture("agent-process-view.json"),
        },
      ],
      4,
    );
    const message = useChatStreamStore.getState().sessions.c4?.messages[0];
    expect(message?.process?.items.map((item) => item.type)).toEqual([
      "reasoning",
      "tool",
      "note",
      "retry",
      "reasoning",
    ]);
    expect(message?.process?.items.map((item) => item.id)).toEqual(["b1", "c1", "n1", "r1", "b2"]);
    expect(message?.process?.items[1]).toEqual({
      type: "tool",
      id: "c1",
      name: "kb_search",
      status: "SUCCESS",
      durationMs: 820,
      target: { label: "期末复习 · 课程库", resolved: true },
      result: {
        count: 5,
        items: [
          {
            ref: "note:12",
            title: "数据结构复习提纲",
            kbName: "课程库",
            kbId: 3,
            locator: { sectionPath: "第2章/2.1", startLine: 10 },
          },
          { ref: "doc:7", title: "往年试卷", kbName: "课程库", kbId: 3, locator: { pageStart: 2 } },
        ],
      },
    });
    expect(message).toMatchObject({ durationMs: 18230, toolCalls: 1, firstOutputMs: 350 });
    expect(message?.processHiddenNotice).toBeUndefined();
  });

  it("回放 Java 隐藏视图共享样例：文字行丢弃，工具行只剩可读条目并显示隐藏提示", () => {
    useChatStreamStore.getState().clear("c5");
    useChatStreamStore.getState().hydrate(
      "c5",
      [
        {
          id: 41,
          role: 1,
          content: "答",
          citations: [],
          answerNotices: [],
          process: processFixture("agent-process-view.hidden.json"),
        },
      ],
      5,
    );
    const message = useChatStreamStore.getState().sessions.c5?.messages[0];
    expect(message?.processHiddenNotice).toBe("部分内容你已无权访问，思考过程已隐藏");
    expect(message?.process?.items.map((item) => item.type)).toEqual(["tool", "retry"]);
    const tool = message?.process?.items[0];
    if (tool?.type !== "tool") throw new Error("期望工具行");
    expect(tool.target).toBeNull();
    expect(tool.result?.items.map((item) => item.ref)).toEqual(["note:12"]);
  });

  it("renameKey 迁移会话（新会话回填场景）且 clear 清空", () => {
    const store = useChatStreamStore.getState();
    store.hydrate(
      "new",
      [{ id: 1, role: 0, content: "问", citations: [], answerNotices: [] }],
      null,
    );
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
