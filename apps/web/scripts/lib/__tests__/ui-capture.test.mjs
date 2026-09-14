import { describe, expect, it } from "vitest";
import { buildNoteBody, comparisonFileName, resolveReference } from "../ui-capture.mjs";

describe("resolveReference", () => {
  it("字符串形式：深浅两态共用同一张拼版", () => {
    const scene = { ref: "p13-skeleton.png" };
    expect(resolveReference(scene, "light")).toBe("p13-skeleton.png");
    expect(resolveReference(scene, "dark")).toBe("p13-skeleton.png");
  });

  /** 编辑器那两屏在设计稿里深浅各占一页，混用会把主题差异读成还原度差距。 */
  it("对象形式：按主题各取各的页", () => {
    const scene = { ref: { light: "p04.png", dark: "p06.png" } };
    expect(resolveReference(scene, "light")).toBe("p04.png");
    expect(resolveReference(scene, "dark")).toBe("p06.png");
  });

  it("该主题没配页时返回 null，而不是退回另一态", () => {
    expect(resolveReference({ ref: { light: "p04.png" } }, "dark")).toBeNull();
  });

  it("没配 ref、空串、空对象一律 null（不假装对比过）", () => {
    expect(resolveReference({}, "light")).toBeNull();
    expect(resolveReference({ ref: "" }, "light")).toBeNull();
    expect(resolveReference({ ref: {} }, "light")).toBeNull();
    expect(resolveReference(undefined, "light")).toBeNull();
  });
});

describe("comparisonFileName", () => {
  /** 回归：曾经不带主题后缀，深浅两张拼图互相覆盖，只剩后跑的那一张。 */
  it("带主题后缀，两态各留一张", () => {
    expect(comparisonFileName("editor-note", "light")).toBe("editor-note-compare-light.png");
    expect(comparisonFileName("editor-note", "dark")).toBe("editor-note-compare-dark.png");
    expect(comparisonFileName("editor-note", "light")).not.toBe(
      comparisonFileName("editor-note", "dark"),
    );
  });
});

describe("buildNoteBody", () => {
  const body = buildNoteBody("交互一致性检查清单");

  it("首节点就是 H1，内容与传入标题一致", () => {
    const first = body.split("\n")[0];
    expect(first).toBe("# 交互一致性检查清单");
    // 首节点必须是 H1：编辑器没有独立标题行，标题就是从首节点取的
    expect(first.startsWith("# ")).toBe(true);
  });

  it("含设计稿对照所需的全部块级元素", () => {
    expect(body).toContain("## 一、按钮与操作");
    expect(body).toContain("## 二、反馈与状态");
    expect(body).toMatch(/^- 一个屏幕内只保留一个主按钮/m);
    expect(body).toContain("44 × 44");
  });

  /**
   * callout 走仓库自己的 `> [!INFO]` 语法（`anynote-callout.ts`），
   * 写成裸 `>` 会退化成普通引用，与设计稿那块灰底引文对不上。
   */
  it("引用块用 callout 语法，不是裸引用", () => {
    expect(body).toContain("> [!INFO]");
    expect(body).toMatch(/^> 原则：/m);
  });

  it("段落之间用空行分隔，符合 CommonMark", () => {
    // 紧跟标题的正文之间必须有空行，否则会被解析成标题的一部分
    expect(body).toContain("# 交互一致性检查清单\n\n这份清单");
  });
});
