import { ApiError } from "@anynote/api-core";
import { describe, expect, it } from "vitest";
import { ExitCode, NetworkError, UsageError, exitCodeFor, isNetworkFailure } from "../core/exit";

describe("exitCodeFor", () => {
  it("用法错误 → 2", () => {
    expect(exitCodeFor(new UsageError("参数不对"))).toBe(ExitCode.USAGE);
  });

  it("未授权与缺少 token → 3", () => {
    expect(exitCodeFor(new ApiError(200, "A0301", "未授权"))).toBe(ExitCode.AUTH);
    expect(exitCodeFor(new ApiError(200, "A0350", "缺少 accessToken"))).toBe(ExitCode.AUTH);
    expect(exitCodeFor(new ApiError(401, "A0311", "refreshToken 失效"))).toBe(ExitCode.AUTH);
  });

  it("版本冲突 → 5", () => {
    expect(exitCodeFor(new ApiError(200, "A0409", "笔记已被其他会话更新"))).toBe(ExitCode.CONFLICT);
  });

  it("资源不存在 → 6", () => {
    expect(exitCodeFor(new ApiError(200, "A0404", "笔记不存在"))).toBe(ExitCode.NOT_FOUND);
  });

  it("后端参数错误 → 2", () => {
    expect(exitCodeFor(new ApiError(200, "A0160", "参数错误"))).toBe(ExitCode.USAGE);
  });

  it("其它业务码 → 1", () => {
    expect(exitCodeFor(new ApiError(200, "B0001", "业务失败"))).toBe(ExitCode.BUSINESS);
  });

  it("HTTP 401/403 即使业务码未知也算认证失败", () => {
    expect(exitCodeFor(new ApiError(401, "B0001", "未登录"))).toBe(ExitCode.AUTH);
    expect(exitCodeFor(new ApiError(403, "B0001", "禁止"))).toBe(ExitCode.AUTH);
  });

  it("HTTP 404 归到 NOT_FOUND", () => {
    expect(exitCodeFor(new ApiError(404, "B0001", "没有这个路由"))).toBe(ExitCode.NOT_FOUND);
  });

  it("网络失败 → 4", () => {
    expect(exitCodeFor(new NetworkError("连不上"))).toBe(ExitCode.NETWORK);
    const wrapped = new TypeError("fetch failed");
    (wrapped as { cause?: unknown }).cause = { code: "ECONNREFUSED" };
    expect(exitCodeFor(wrapped)).toBe(ExitCode.NETWORK);
  });

  it("未知异常 → 1", () => {
    expect(exitCodeFor(new Error("说不清"))).toBe(ExitCode.BUSINESS);
    expect(exitCodeFor("字符串错误")).toBe(ExitCode.BUSINESS);
  });
});

describe("isNetworkFailure", () => {
  it("识别常见的连接类 errno", () => {
    for (const code of ["ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "EAI_AGAIN", "ETIMEDOUT"]) {
      const error = new Error("boom");
      (error as { cause?: unknown }).cause = { code };
      expect(isNetworkFailure(error)).toBe(true);
    }
  });

  it("业务异常不算网络失败", () => {
    expect(isNetworkFailure(new ApiError(200, "B0001", "业务失败"))).toBe(false);
  });
});
