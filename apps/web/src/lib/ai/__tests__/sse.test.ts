import { decodeAiSseData, toAiRunErrorMessage } from "@/lib/ai/sse";
import { ApiError } from "@/lib/api/errors";
import { describe, expect, it } from "vitest";

function event(type: string, data: Record<string, unknown> = {}) {
  return JSON.stringify({
    seq: 1,
    runId: "run-1",
    ts: "2026-11-15T12:00:00Z",
    type,
    data,
  });
}

describe("decodeAiSseData", () => {
  it("解析统一 Agent 事件信封", () => {
    expect(decodeAiSseData(event("text.delta", { delta: "你好" }))).toEqual({
      seq: 1,
      runId: "run-1",
      ts: "2026-11-15T12:00:00Z",
      type: "text.delta",
      data: { delta: "你好" },
    });
  });

  it("保留 run.started 中的会话标识", () => {
    const runStarted = decodeAiSseData(event("run.started", { conversationId: 42 }));
    expect(runStarted.data.conversationId).toBe(42);
  });

  it("非 JSON 载荷显示已确认的服务失败文案", () => {
    expect(() => decodeAiSseData("<html>gateway error</html>")).toThrowError(
      "服务暂时不可用，请稍后重试",
    );
  });

  it("缺少事件信封字段时显示已确认的服务失败文案", () => {
    expect(() => decodeAiSseData(JSON.stringify({ type: "text.delta", data: {} }))).toThrowError(
      "服务暂时不可用，请稍后重试",
    );
  });

  it("拒绝旧 ResData chunk 协议", () => {
    expect(() =>
      decodeAiSseData(JSON.stringify({ code: "00000", data: { status: "success" } })),
    ).toThrowError(ApiError);
  });
});

describe("toAiRunErrorMessage", () => {
  it("保留已确认的运行错误文案", () => {
    expect(toAiRunErrorMessage("当前使用人数较多，请稍后再试")).toBe(
      "当前使用人数较多，请稍后再试",
    );
    expect(toAiRunErrorMessage("今日 AI 问答次数已达上限，请明天再试。")).toBe(
      "今日 AI 问答次数已达上限，请明天再试。",
    );
  });

  it("未知错误使用已确认的运行失败文案", () => {
    expect(toAiRunErrorMessage("内部错误详情")).toBe("服务暂时不可用，请稍后重试");
  });
});
