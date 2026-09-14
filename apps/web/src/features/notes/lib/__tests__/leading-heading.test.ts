import { describe, expect, it } from "vitest";
import { ensureLeadingHeading, stripLeadingHeading } from "../leading-heading";

describe("ensureLeadingHeading", () => {
  it("正文已经有顶部 H1 时原样返回，连前导空行都不动", () => {
    expect(ensureLeadingHeading("# 已有标题\n\n正文", "数据库里的标题")).toBe("# 已有标题\n\n正文");
    // 前导空行同样不改写——打开一篇笔记不该产生一次无谓的差异
    expect(ensureLeadingHeading("\n\n# 已有标题\n正文", "数据库里的标题")).toBe(
      "\n\n# 已有标题\n正文",
    );
  });

  it("正文没有顶部 H1 时，用已存标题补一个，并与正文隔一个空行", () => {
    expect(ensureLeadingHeading("正文内容", "会议纪要")).toBe("# 会议纪要\n\n正文内容");
  });

  it("正文为空时只补标题，不留下悬空的空行", () => {
    expect(ensureLeadingHeading("", "会议纪要")).toBe("# 会议纪要");
    expect(ensureLeadingHeading("   \n ", "会议纪要")).toBe("# 会议纪要");
  });

  it("标题为空或只有空白时退回占位标题", () => {
    expect(ensureLeadingHeading("正文", "")).toBe("# 未命名笔记\n\n正文");
    expect(ensureLeadingHeading("正文", "   ")).toBe("# 未命名笔记\n\n正文");
    expect(ensureLeadingHeading("正文", null)).toBe("# 未命名笔记\n\n正文");
    expect(ensureLeadingHeading("正文", undefined)).toBe("# 未命名笔记\n\n正文");
  });

  it("标题两端空白被去掉，不把缩进带进 H1", () => {
    expect(ensureLeadingHeading("正文", "  会议纪要  ")).toBe("# 会议纪要\n\n正文");
  });

  /** `#话题` 在 CommonMark 里不是标题，不能当成「已经有顶部 H1」而跳过补齐。 */
  it("井号后面没有空格的 #话题 不算一级标题", () => {
    expect(ensureLeadingHeading("#话题标签\n正文", "会议纪要")).toBe(
      "# 会议纪要\n\n#话题标签\n正文",
    );
  });

  it("正文以代码围栏开头时照样补齐（围栏里的 # 不是标题）", () => {
    expect(ensureLeadingHeading("```sh\n# 注释\n```", "会议纪要")).toBe(
      "# 会议纪要\n\n```sh\n# 注释\n```",
    );
  });

  it("补齐后再次补齐不会重复追加标题（打开两次是幂等的）", () => {
    const once = ensureLeadingHeading("正文内容", "会议纪要");
    expect(ensureLeadingHeading(once, "会议纪要")).toBe(once);
  });
});

describe("stripLeadingHeading", () => {
  it("去掉顶部 H1 与它后面那行空行，取回正文", () => {
    expect(stripLeadingHeading("# 会议纪要\n\n正文内容")).toBe("正文内容");
    expect(stripLeadingHeading("# 会议纪要\n正文内容")).toBe("正文内容");
  });

  it("只有标题时取回空串", () => {
    expect(stripLeadingHeading("# 会议纪要")).toBe("");
  });

  /** 字数只该回答「正文多长」，没有顶部 H1 时不能顺手砍掉第一段。 */
  it("没有顶部 H1 时原样返回", () => {
    expect(stripLeadingHeading("正文内容")).toBe("正文内容");
    expect(stripLeadingHeading("#话题标签\n正文")).toBe("#话题标签\n正文");
  });

  it("只吃第一行，正文里后面的 H1 保持不动", () => {
    expect(stripLeadingHeading("# 标题\n\n一、按钮\n\n# 二级标题")).toBe("一、按钮\n\n# 二级标题");
  });
});
