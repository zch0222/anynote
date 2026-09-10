import { AI_CONTINUE_CONTEXT_CHARS, buildContinuePrompt, decodeAiSseData } from "@/lib/ai/sse";
import { ApiError } from "@/lib/api/errors";
import { describe, expect, it } from "vitest";

/** 后端 services/ai 的真实事件形状：`data: {"code":"00000","msg":...,"data":{...}}`。 */
function envelope(data: unknown, code = "00000", msg = "操作成功"): string {
  return JSON.stringify({ code, msg, data });
}

describe("decodeAiSseData", () => {
  it("解析成功增量 chunk", () => {
    const chunk = decodeAiSseData(
      envelope({ status: "success", message: "你好", conversationId: null }),
    );
    expect(chunk.status).toBe("success");
    expect(chunk.message).toBe("你好");
    expect(chunk.conversationId).toBeNull();
  });

  it("解析携带 conversationId 的 chunk（新会话首包）", () => {
    const chunk = decodeAiSseData(
      envelope({ status: "success", message: "，", conversationId: 42 }),
    );
    expect(chunk.conversationId).toBe(42);
  });

  it("解析 failed 状态（后端异常收尾事件）", () => {
    const chunk = decodeAiSseData(envelope({ status: "failed", message: null }));
    expect(chunk.status).toBe("failed");
    expect(chunk.message).toBeNull();
  });

  it("信封业务错误码抛 ApiError 并透传 code/msg", () => {
    expect(() => decodeAiSseData(envelope(null, "A0301", "没有权限"))).toThrowError(ApiError);
    try {
      decodeAiSseData(envelope(null, "A0301", "没有权限"));
    } catch (error) {
      expect((error as ApiError).code).toBe("A0301");
      expect((error as ApiError).message).toBe("没有权限");
    }
  });

  it("非 JSON 载荷抛 B0500", () => {
    try {
      decodeAiSseData("<html>gateway error</html>");
      expect.unreachable();
    } catch (error) {
      expect((error as ApiError).code).toBe("B0500");
    }
  });

  it("data 结构缺失字段抛 B0500", () => {
    expect(() => decodeAiSseData(envelope({ unknown: true }))).toThrowError(ApiError);
  });

  it("data 缺失（undefined）视为异常", () => {
    expect(() => decodeAiSseData(JSON.stringify({ code: "00000" }))).toThrowError(ApiError);
  });
});

describe("buildContinuePrompt", () => {
  it("包含续写指令与上下文", () => {
    const prompt = buildContinuePrompt("第一段内容。");
    expect(prompt).toContain("继续写作");
    expect(prompt).toContain("第一段内容。");
  });

  it("上下文超长时只保留尾部窗口", () => {
    const long = "前".repeat(AI_CONTINUE_CONTEXT_CHARS + 500);
    const tail = "后".repeat(100);
    const prompt = buildContinuePrompt(long + tail);
    // 尾部 2000 字窗口 = 1900 个“前” + 100 个“后”，前 600 个字符被裁掉
    const kept = (prompt.match(/前/g) ?? []).length;
    expect(kept).toBe(AI_CONTINUE_CONTEXT_CHARS - 100);
    expect(prompt).toContain(tail);
  });
});
