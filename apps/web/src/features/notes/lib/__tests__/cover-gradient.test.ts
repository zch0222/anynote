import { describe, expect, it } from "vitest";
import {
  KB_COVER_VARIANTS,
  coverAvatarClassName,
  coverClassName,
  coverVariant,
} from "../cover-gradient";

describe("知识库封面渐变", () => {
  it("变体数量与 CSS 里定义的 .kb-cover-0..4 一致", () => {
    // 这条断言是 CSS 与 TS 之间的契约：加了色组必须两边一起加
    expect(KB_COVER_VARIANTS).toBe(5);
  });

  it("按 ID 取模选组，同一个库每次颜色稳定", () => {
    expect(coverVariant(1)).toBe(1);
    expect(coverVariant(2)).toBe(2);
    expect(coverVariant(4)).toBe(4);
    expect(coverVariant(5)).toBe(0);
    expect(coverVariant(6)).toBe(1);
    expect(coverVariant(1)).toBe(coverVariant(1));
  });

  it("大 ID 也能落回合法区间", () => {
    for (const id of [7, 99, 12345, Number.MAX_SAFE_INTEGER]) {
      const variant = coverVariant(id);
      expect(variant).toBeGreaterThanOrEqual(0);
      expect(variant).toBeLessThan(KB_COVER_VARIANTS);
    }
  });

  it("非法输入退到第 0 组而不是产生 NaN 类名", () => {
    expect(coverVariant(Number.NaN)).toBe(0);
    expect(coverVariant(Number.POSITIVE_INFINITY)).toBe(0);
    expect(coverVariant(-3)).toBe(2);
    expect(coverVariant(3.9)).toBe(3);
  });

  it("类名同时带基础类与具体色组", () => {
    expect(coverClassName(3)).toBe("kb-cover kb-cover-3");
    expect(coverClassName(5)).toBe("kb-cover kb-cover-0");
    // twMerge 不应把两个类合并掉
    expect(coverClassName(2).split(" ")).toHaveLength(2);
  });

  it("头像复用同一组色，并附加尺寸类", () => {
    expect(coverAvatarClassName(2, "size-10")).toContain("kb-cover-2");
    expect(coverAvatarClassName(2, "size-10")).toContain("size-10");
  });
});
