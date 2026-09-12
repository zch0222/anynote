import { describe, expect, it } from "vitest";
import { z } from "zod";
import { baseTypeOf, describeField, isBooleanField, optionFlag } from "../core/schema-introspect";

describe("baseTypeOf", () => {
  it("剥掉 optional / default 拿到底层类型", () => {
    expect(baseTypeOf(z.string())).toBe("string");
    expect(baseTypeOf(z.boolean().default(false))).toBe("boolean");
    expect(baseTypeOf(z.string().optional())).toBe("string");
    expect(baseTypeOf(z.coerce.number().int().min(1).default(1))).toBe("number");
  });

  it("枚举保持 enum", () => {
    expect(baseTypeOf(z.enum(["json", "markdown"]).default("json"))).toBe("enum");
  });

  it("非 zod 输入不炸", () => {
    expect(baseTypeOf(undefined)).toBe("unknown");
    expect(baseTypeOf({})).toBe("unknown");
  });
});

describe("isBooleanField", () => {
  it("布尔字段渲染成开关，其它渲染成取值选项", () => {
    expect(isBooleanField(z.boolean().default(false))).toBe(true);
    expect(isBooleanField(z.string().optional())).toBe(false);
    expect(isBooleanField(z.coerce.number())).toBe(false);
  });
});

describe("optionFlag", () => {
  it("驼峰转 kebab", () => {
    expect(optionFlag("passwordStdin")).toBe("--password-stdin");
    expect(optionFlag("base")).toBe("--base");
    expect(optionFlag("dryRun")).toBe("--dry-run");
  });
});

describe("describeField", () => {
  it("读出 describe() 文案，没有则空串", () => {
    expect(describeField(z.string().describe("用户名"))).toBe("用户名");
    expect(describeField(z.string())).toBe("");
  });
});
