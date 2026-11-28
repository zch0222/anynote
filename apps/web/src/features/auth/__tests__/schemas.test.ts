/**
 * 注册密码规则单测：允许特殊字符、拒绝空格与缺失大小写数字。
 *
 * @author 称霸幼儿园
 */
import { describe, expect, it } from "vitest";
import { registerSchema } from "../schemas";

const base = { username: "tester01", nickname: "测试用户", sex: 0 as const };

function validate(password: string) {
  return registerSchema.safeParse({ ...base, password });
}

describe("registerSchema 密码规则", () => {
  it("允许特殊字符", () => {
    expect(validate("Abcdef1*").success).toBe(true);
    expect(validate("Abcdef1!@#").success).toBe(true);
  });

  it("拒绝空格", () => {
    expect(validate("Abcdef1 *").success).toBe(false);
  });

  it("仍要求大写、小写和数字", () => {
    expect(validate("abcdef1*").success).toBe(false);
    expect(validate("ABCDEF1*").success).toBe(false);
    expect(validate("Abcdefg*").success).toBe(false);
  });

  it("拒绝越界长度", () => {
    expect(validate("Abc1*").success).toBe(false);
    expect(validate("Abcdef1234567890").success).toBe(false);
  });
});
