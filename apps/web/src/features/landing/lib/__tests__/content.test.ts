import {
  AI,
  BENTO_COUNTS,
  CTA,
  FOOTER,
  FOOTER_COLUMNS,
  HERO,
  NAV_LINKS,
} from "@/features/landing/lib/content";
import { describe, expect, it } from "vitest";

/**
 * 落地页文案表的守卫（D-19 / M-14）。
 *
 * 这一页的验收口径是"与画板逐字一致"，所以这些断言抄的就是画板上的字。
 * 它们看着像"重复一遍常量"，但那正是重点：**改动文案时两处必须一起动**，
 * 而漏改一处就会在这里红，而不是等到人肉比对截图时才发现。
 */
describe("落地页导航与首屏文案", () => {
  it("导航四项与画板一致，且锚点指向页内区块", () => {
    expect(NAV_LINKS.map((l) => l.label)).toEqual(["功能", "AI 能力", "下载", "文档"]);
    // 「功能」「AI 能力」是页内锚点，必须与 section 的 id 对得上
    expect(NAV_LINKS[0]?.href).toBe("#features");
    expect(NAV_LINKS[1]?.href).toBe("#ai");
  });

  it("首屏文案与画板一致", () => {
    expect(HERO.badge).toBe("全新网页版 · 现已上线");
    expect(HERO.title).toBe("把知识，安顿在一个安静的地方");
    expect(HERO.trust).toBe("免费使用 · 支持自托管部署 · 数据属于你自己");
  });

  /**
   * 移动端副文比桌面**少半句**，这是画板上的真实差异（M-14 只有第一句）。
   * 断言"移动版是桌面版的前缀"而不是抄两遍全句：将来改前半句时，
   * 只要两态还保持前缀关系就仍然成立，少写一条容易漏改的重复。
   */
  it("移动端副文是桌面版的前缀，且确实更短", () => {
    expect(HERO.subtitle.startsWith(HERO.subtitleMobile)).toBe(true);
    expect(HERO.subtitleMobile.length).toBeLessThan(HERO.subtitle.length);
    expect(HERO.subtitleMobile).toBe("知识库、笔记、慕课、任务与协同文档，收进同一个工作台。");
  });

  it("两个 CTA 分别指向注册与页内 AI 区块", () => {
    expect(HERO.primaryCta).toEqual({ label: "免费开始", href: "/register" });
    expect(HERO.secondaryCta.href).toBe("#ai");
  });
});

describe("Bento 计数", () => {
  it("五格维度与画板一致，顺序固定", () => {
    expect(BENTO_COUNTS.map((c) => c.label)).toEqual(["笔记", "慕课", "任务", "资料", "成员"]);
    expect(BENTO_COUNTS.map((c) => c.value)).toEqual(["128", "6", "12", "34", "8"]);
  });

  /**
   * 每一格的数字色**互不相同**：概览的 5 格计数靠颜色区分维度（与站内 D-02 同源），
   * 两格撞色就失去识别作用了。
   */
  it("五格用五个不同的色相", () => {
    const tones = BENTO_COUNTS.map((c) => c.tone);
    expect(new Set(tones).size).toBe(tones.length);
  });
});

describe("AI 专区", () => {
  it("两张卡的标题与画板一致", () => {
    expect(AI.cards.map((c) => c.title)).toEqual(["AI 问答", "PDF 问答"]);
    expect(AI.badge).toBe("AI 能力");
  });

  it("AI 卡与 PDF 卡各自带一组示意内容", () => {
    const [chat, pdf] = AI.cards;
    expect(chat.question).toBe("这个季度的复盘要点是什么？");
    expect(chat.source).toContain("出处");
    expect(pdf.fileMeta).toContain("已索引");
    expect(pdf.fileName.endsWith(".pdf")).toBe(true);
  });
});

describe("结尾转化区", () => {
  it("主按钮指向注册、次按钮指向自托管文档", () => {
    expect(CTA.primary.href).toBe("/register");
    expect(CTA.secondary).toEqual({ label: "自托管部署", href: "/docs/self-hosting" });
  });
});

describe("页脚", () => {
  it("三列标题与画板一致", () => {
    expect(FOOTER_COLUMNS.map((c) => c.title)).toEqual(["产品", "资源", "关于"]);
  });

  /**
   * 移动端每列**少一项**，且少的位置并不统一（产品列去末项、关于列去中间项）。
   * 所以这里逐个断言，而不是断言"是前 3 项"——后者正是当初写错的假设。
   */
  it("移动端每列少的那一项与画板一致（不是统一截断）", () => {
    const [product, resource, about] = FOOTER_COLUMNS;
    expect(product?.mobileLinks.map((l) => l.label)).toEqual(["功能", "AI 能力", "下载"]);
    expect(resource?.mobileLinks.map((l) => l.label)).toEqual([
      "使用文档",
      "自托管指南",
      "CLI 工具",
    ]);
    // 关于列去掉的是**中间**的「联系方式」，不是末项
    expect(about?.mobileLinks.map((l) => l.label)).toEqual(["关于我们", "隐私政策", "服务条款"]);
  });

  it("移动端每列都比桌面少，且少的项确实在桌面清单里", () => {
    for (const column of FOOTER_COLUMNS) {
      expect(column.mobileLinks.length).toBeLessThan(column.links.length);
      const desktop = column.links.map((l) => l.label);
      for (const link of column.mobileLinks) expect(desktop).toContain(link.label);
    }
  });

  it("版权行写的是 2026（与画板一致）", () => {
    expect(FOOTER.copyright).toBe("© 2026 Anynote. 保留所有权利。");
    expect(FOOTER.locale).toBe("简体中文 · 服务状态");
  });
});
