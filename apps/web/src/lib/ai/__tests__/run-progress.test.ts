import { describe, expect, it } from "vitest";
import { runProgress } from "../run-progress";

/**
 * 运行进度文案映射测试。
 *
 * @author 称霸幼儿园
 */
describe("runProgress", () => {
  /** 未知工具与未确认摘要不直接展示给用户。 */
  it("仅使用已确认的进度说明", () => {
    const event = {
      seq: 1,
      runId: "r1",
      ts: "now",
      type: "tool.started",
      data: { name: "kb_read", summary: "不应展示的任意内容" },
    };
    expect(runProgress(event)).toBe("阅读原文");
    expect(runProgress({ ...event, data: { name: "unknown", summary: "不应展示" } })).toBeNull();
    expect(runProgress({ ...event, type: "state", data: { state: "VERIFYING" } })).toBe(
      "正在生成回答",
    );
  });
});
