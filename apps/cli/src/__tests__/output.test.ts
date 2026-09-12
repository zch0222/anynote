import { ApiError } from "@anynote/api-core";
import { describe, expect, it } from "vitest";
import { ExitCode } from "../core/exit";
import {
  displayWidth,
  failureEnvelope,
  pickFields,
  renderHuman,
  successEnvelope,
  writeFailure,
  writeSuccess,
} from "../core/output";
import { makeIo } from "./helpers";

describe("信封", () => {
  it("成功信封只有 ok / command / data", () => {
    expect(successEnvelope("base list", [{ id: 1 }])).toEqual({
      ok: true,
      command: "base list",
      data: [{ id: 1 }],
    });
  });

  it("ApiError 失败信封带 code / status / exitCode", () => {
    const envelope = failureEnvelope(
      "note set",
      new ApiError(200, "A0409", "冲突", "trace-1"),
      ExitCode.CONFLICT,
    );
    expect(envelope).toEqual({
      ok: false,
      command: "note set",
      error: {
        code: "A0409",
        message: "冲突",
        status: 200,
        traceId: "trace-1",
        exitCode: 5,
      },
    });
  });

  it("没有 traceId 时不输出该字段", () => {
    const envelope = failureEnvelope(
      "note get",
      new ApiError(200, "B0001", "炸了"),
      ExitCode.BUSINESS,
    );
    expect("traceId" in envelope.error).toBe(false);
  });

  it("普通异常也能转成信封", () => {
    const envelope = failureEnvelope("doctor", new Error("说不清"), ExitCode.BUSINESS);
    expect(envelope.error).toMatchObject({ code: "Error", message: "说不清", exitCode: 1 });
  });
});

describe("pickFields", () => {
  it("裁剪对象", () => {
    expect(pickFields({ id: 1, title: "t", extra: "x" }, ["id", "title"])).toEqual({
      id: 1,
      title: "t",
    });
  });

  it("逐条裁剪数组", () => {
    expect(pickFields([{ id: 1, extra: 2 }], ["id"])).toEqual([{ id: 1 }]);
  });

  it("忽略不存在的字段", () => {
    expect(pickFields({ id: 1 }, ["id", "nope"])).toEqual({ id: 1 });
  });

  it("不给字段时原样返回", () => {
    const data = { id: 1 };
    expect(pickFields(data, undefined)).toBe(data);
    expect(pickFields(data, [])).toBe(data);
  });

  it("标量原样返回", () => {
    expect(pickFields(42, ["id"])).toBe(42);
  });
});

describe("renderHuman", () => {
  it("对象数组渲染成表格", () => {
    const text = renderHuman([
      { id: 1, title: "笔记" },
      { id: 22, title: "另一条" },
    ]);
    const lines = text.split("\n");
    expect(lines[0]).toMatch(/^id\s+title/);
    expect(lines).toHaveLength(4);
  });

  it("空数组给出提示而不是空白", () => {
    expect(renderHuman([])).toBe("(空)");
  });

  it("对象渲染成键值行", () => {
    expect(renderHuman({ id: 1, title: "笔记" })).toBe("id     1\ntitle  笔记");
  });

  it("null 渲染成 -", () => {
    expect(renderHuman({ detail: null })).toBe("detail  -");
  });

  it("CJK 按双宽计算，表格不会错位", () => {
    expect(displayWidth("笔记")).toBe(4);
    expect(displayWidth("ab")).toBe(2);
  });
});

describe("writeSuccess / writeFailure", () => {
  it("JSON 模式把信封写进 stdout", () => {
    const { io, state } = makeIo();
    writeSuccess(io, "json", "base list", { data: [{ id: 1 }] });
    expect(JSON.parse(state.stdout)).toEqual({ ok: true, command: "base list", data: [{ id: 1 }] });
    expect(state.stderr).toBe("");
  });

  it("JSON 模式下 --fields 生效", () => {
    const { io, state } = makeIo();
    writeSuccess(io, "json", "base list", { data: [{ id: 1, extra: 2 }] }, ["id"]);
    expect(JSON.parse(state.stdout).data).toEqual([{ id: 1 }]);
  });

  it("人类模式用自定义 render，且 notes 只进 stderr", () => {
    const { io, state } = makeIo(true);
    writeSuccess(io, "human", "note get", {
      data: { content: "# 正文" },
      render: (data) => (data as { content: string }).content,
      notes: ["提示"],
    });
    expect(state.stdout).toBe("# 正文\n");
    expect(state.stderr).toBe("提示\n");
  });

  it("失败在 JSON 模式走 stdout，人类模式走 stderr", () => {
    const json = makeIo();
    writeFailure(
      json.io,
      "json",
      "note set",
      new ApiError(200, "A0409", "冲突"),
      ExitCode.CONFLICT,
    );
    expect(JSON.parse(json.state.stdout).error.code).toBe("A0409");
    expect(json.state.stderr).toBe("");

    const human = makeIo(true);
    writeFailure(
      human.io,
      "human",
      "note set",
      new ApiError(200, "A0409", "冲突"),
      ExitCode.CONFLICT,
    );
    expect(human.state.stdout).toBe("");
    expect(human.state.stderr).toContain("A0409");
  });
});
