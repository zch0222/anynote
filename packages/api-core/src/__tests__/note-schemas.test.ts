import { describe, expect, it } from "vitest";
import { z } from "zod";
import { knowledgeBaseSchema, noteDetailSchema, pageBeanSchema, toVersion } from "../note-schemas";

describe("toVersion", () => {
  it("把 updateTime 转成毫秒字符串", () => {
    expect(toVersion("2026-09-12T01:36:15.000+08:00")).toBe(
      String(Date.parse("2026-09-12T01:36:15.000+08:00")),
    );
  });

  it("空值返回 null", () => {
    expect(toVersion(null)).toBeNull();
    expect(toVersion(undefined)).toBeNull();
    expect(toVersion("")).toBeNull();
  });

  it("不可解析的时间返回 null", () => {
    expect(toVersion("不是时间")).toBeNull();
  });
});

describe("pageBeanSchema", () => {
  const schema = pageBeanSchema(z.object({ id: z.number() }));

  it("rows 为 null 时归一化成空数组", () => {
    expect(schema.parse({ current: 1, pages: 0, total: 0, rows: null }).rows).toEqual([]);
  });

  it("rows 缺失时同样归一化成空数组", () => {
    expect(schema.parse({ total: 0 }).rows).toEqual([]);
  });

  it("逐条校验 rows", () => {
    expect(() => schema.parse({ rows: [{ id: "x" }] })).toThrow();
  });
});

describe("领域 schema 容忍后端多字段", () => {
  it("knowledgeBaseSchema 忽略未知字段", () => {
    const parsed = knowledgeBaseSchema.parse({
      id: 70,
      knowledgeBaseName: "CLI库",
      cover: "https://example.com/c.png",
      detail: "d",
      permissions: 1,
      updateTime: "2026-09-12T01:36:15.000+08:00",
      organizationId: 3,
      params: {},
    });
    expect(parsed.id).toBe(70);
    expect("organizationId" in parsed).toBe(false);
  });

  it("noteDetailSchema 允许 content 为空", () => {
    expect(noteDetailSchema.parse({ id: 1, content: null }).content).toBeNull();
  });

  it("id 缺失时抛错", () => {
    expect(() => noteDetailSchema.parse({ title: "无 id" })).toThrow();
  });
});
