import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, unwrapEnvelope } from "../errors";

function envelope(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("unwrapEnvelope", () => {
  it("成功信封返回 parse 后的 data", async () => {
    const response = envelope({ code: "00000", msg: "操作成功", data: { id: 7 } });
    await expect(unwrapEnvelope(response, z.object({ id: z.number() }).parse)).resolves.toEqual({
      id: 7,
    });
  });

  it("业务码非 00000 抛 ApiError 并带上 code 与 msg", async () => {
    const response = envelope({ code: "A0409", msg: "笔记已被其他会话更新，请刷新后重试" });
    await expect(unwrapEnvelope(response, (data) => data)).rejects.toMatchObject({
      name: "ApiError",
      code: "A0409",
      message: "笔记已被其他会话更新，请刷新后重试",
      status: 200,
    });
  });

  it("HTTP 失败即使 code 是 00000 也抛错", async () => {
    const response = envelope({ code: "00000", data: null }, { status: 500 });
    await expect(unwrapEnvelope(response, (data) => data)).rejects.toBeInstanceOf(ApiError);
  });

  it("透传 x-trace-id 响应头", async () => {
    const response = new Response(JSON.stringify({ code: "B0001", msg: "炸了" }), {
      status: 200,
      headers: { "content-type": "application/json", "x-trace-id": "trace-42" },
    });
    await expect(unwrapEnvelope(response, (data) => data)).rejects.toMatchObject({
      traceId: "trace-42",
    });
  });

  it("回退读取 trace-id 响应头", async () => {
    const response = new Response(JSON.stringify({ code: "B0001", msg: "炸了" }), {
      status: 200,
      headers: { "content-type": "application/json", "trace-id": "trace-7" },
    });
    await expect(unwrapEnvelope(response, (data) => data)).rejects.toMatchObject({
      traceId: "trace-7",
    });
  });

  it("非 JSON 响应体报格式异常 B0500", async () => {
    const response = new Response("<html>502 Bad Gateway</html>", { status: 502 });
    await expect(unwrapEnvelope(response, (data) => data)).rejects.toMatchObject({
      code: "B0500",
      message: "服务响应格式异常",
    });
  });

  it("缺少 code 字段的 JSON 同样报格式异常", async () => {
    const response = envelope({ msg: "没有 code" });
    await expect(unwrapEnvelope(response, (data) => data)).rejects.toMatchObject({
      code: "B0500",
      message: "服务响应格式异常",
    });
  });

  it("data 不满足调用方 schema 时报数据异常", async () => {
    const response = envelope({ code: "00000", data: { id: "不是数字" } });
    await expect(
      unwrapEnvelope(response, z.object({ id: z.number() }).parse),
    ).rejects.toMatchObject({ code: "B0500", message: "服务响应数据异常" });
  });

  it("msg 缺失时给出默认失败文案", async () => {
    const response = envelope({ code: "B0001" });
    await expect(unwrapEnvelope(response, (data) => data)).rejects.toMatchObject({
      message: "请求失败",
    });
  });
});
