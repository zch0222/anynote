import { ApiError } from "@/lib/api/errors";
import { describe, expect, it, vi } from "vitest";
import { toUserMessage } from "../errors";

describe("toUserMessage", () => {
  it("网络层 TypeError 说成网络问题，不透出 Failed to fetch", () => {
    expect(toUserMessage(new TypeError("Failed to fetch"))).toBe("网络连接超时，请检查网络后重试");
  });

  it("TimeoutError 归入同一类", () => {
    const error = new Error("signal timed out");
    error.name = "TimeoutError";
    expect(toUserMessage(error)).toBe("网络连接超时，请检查网络后重试");
  });

  it("ApiError 透传后端业务原因", () => {
    expect(toUserMessage(new ApiError(200, "B0001", "笔记名已存在"))).toBe("笔记名已存在");
  });

  it.each([
    ["请确认 collab 服务已启动", "collab"],
    ["MinIO 连接失败", "MinIO"],
    ["OBS 上传异常", "OBS"],
    ["内部服务错误 B0400", "B0400"],
  ])("含实现细节的文案（%s）换成兜底并打日志", (raw) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(toUserMessage(new ApiError(200, "B0001", raw))).toBe("服务暂时不可用，请稍后重试");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("空消息与 null 也给兜底，不显示空白", () => {
    expect(toUserMessage(new Error("   "))).toBe("服务暂时不可用，请稍后重试");
    expect(toUserMessage(null)).toBe("服务暂时不可用，请稍后重试");
  });
});
