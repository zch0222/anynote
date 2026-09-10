import { describe, expect, it } from "vitest";
import {
  ALL_BASE_PERMISSIONS,
  createBaseSchema,
  createNoteSchema,
  knowledgeBaseSchema,
  noteDetailSchema,
  noteSaveResultSchema,
  pageBeanSchema,
  toVersion,
} from "../schemas";

describe("toVersion", () => {
  it("由 updateTime 派生毫秒时间戳字符串", () => {
    expect(toVersion("2026-09-11T10:00:00.000Z")).toBe(
      String(Date.parse("2026-09-11T10:00:00.000Z")),
    );
  });

  it("空值与无法解析的时间返回 null", () => {
    expect(toVersion(null)).toBeNull();
    expect(toVersion(undefined)).toBeNull();
    expect(toVersion("")).toBeNull();
    expect(toVersion("不是时间")).toBeNull();
  });
});

describe("pageBeanSchema", () => {
  const schema = pageBeanSchema(knowledgeBaseSchema);

  it("解析分页字段并逐条校验 rows", () => {
    const page = schema.parse({
      current: 1,
      pages: 2,
      total: 12,
      rows: [{ id: 1, knowledgeBaseName: "笔记库" }],
    });
    expect(page.rows).toHaveLength(1);
    expect(page.total).toBe(12);
  });

  it("rows 为 null 时兜底为空数组", () => {
    expect(schema.parse({ rows: null }).rows).toEqual([]);
  });

  it("rows 内字段缺失按 schema 容错（仅 id 必填）", () => {
    expect(schema.parse({ rows: [{ id: 3 }] }).rows).toEqual([{ id: 3 }]);
  });

  it("rows 内 id 缺失时校验失败", () => {
    expect(() => schema.parse({ rows: [{ knowledgeBaseName: "没有 id" }] })).toThrow();
  });
});

describe("noteDetailSchema / noteSaveResultSchema", () => {
  it("详情：content 为空串时保留，后端多余字段被忽略", () => {
    const detail = noteDetailSchema.parse({
      id: 9,
      content: "",
      createBy: 1,
      unknownField: "x",
    });
    expect(detail).toMatchObject({ id: 9, content: "" });
  });

  it("保存结果：version 与 updateTime 允许缺省", () => {
    const result = noteSaveResultSchema.parse({ id: 1 });
    expect(result.version).toBeUndefined();
    expect(result.updateTime).toBeUndefined();
  });
});

describe("创建表单 schema 边界", () => {
  it("笔记标题 3-15 个字符，去除首尾空白后校验", () => {
    expect(createNoteSchema.safeParse({ title: "  abc  " }).success).toBe(true);
    expect(createNoteSchema.safeParse({ title: "ab" }).success).toBe(false);
    expect(createNoteSchema.safeParse({ title: "a".repeat(15) }).success).toBe(true);
    expect(createNoteSchema.safeParse({ title: "a".repeat(16) }).success).toBe(false);
  });

  it("知识库名称必填且 ≤30 字符，简介 ≤200 字符", () => {
    expect(createBaseSchema.safeParse({ name: "", detail: "" }).success).toBe(false);
    expect(
      createBaseSchema.safeParse({ name: "a".repeat(30), detail: "d".repeat(200) }).success,
    ).toBe(true);
    expect(createBaseSchema.safeParse({ name: "a".repeat(31), detail: "" }).success).toBe(false);
    expect(createBaseSchema.safeParse({ name: "ok", detail: "d".repeat(201) }).success).toBe(false);
  });
});

describe("常量", () => {
  it("ALL_BASE_PERMISSIONS 与后端枚举口径一致（4 = 全部）", () => {
    expect(ALL_BASE_PERMISSIONS).toBe(4);
  });
});
