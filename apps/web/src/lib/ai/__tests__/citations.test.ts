import { describe, expect, it } from "vitest";
import {
  citationHref,
  citationLabel,
  citationSchema,
  parseCitations,
  positiveParam,
} from "../citations";

/**
 * 引用路由与结构校验测试。
 *
 * @author 称霸幼儿园
 */
describe("引用定位", () => {
  /** 无效引用不进入列表，重复编号使用最后的有效值。 */
  it("校验引用数组和 URL 参数", () => {
    expect(
      parseCitations([
        { index: 2, sourceType: "doc", sourceId: "doc:3" },
        null,
        { index: 1, sourceType: "note", sourceId: "note:5" },
        { index: 2, sourceType: "doc", sourceId: "doc:4" },
      ]).map((item) => item.sourceId),
    ).toEqual(["note:5", "doc:4"]);
    expect(["1", "0", "-1", "1.5", "1e3", "9007199254740992"].map(positiveParam)).toEqual([
      1,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
  const citation = {
    index: 1,
    sourceType: "note",
    sourceId: "note:5",
    kbId: 3,
    locator: { sectionPath: "第一章 > 索引", startLine: 12 },
  };

  /** 两端笔记链接携带标题路径与行定位。 */
  it("笔记小节按端生成链接", () => {
    expect(citationHref(citation, "desktop")).toBe(
      "/notes/3/5?section=%E7%AC%AC%E4%B8%80%E7%AB%A0+%3E+%E7%B4%A2%E5%BC%95&line=12",
    );
    expect(citationHref(citation, "mobile")).toContain("/m/notes/3/5?");
  });

  /** PDF 页码与视频毫秒定位映射到已有页面。 */
  it("资料与视频携带定位参数", () => {
    expect(
      citationHref(
        { ...citation, sourceType: "doc", sourceId: "doc:7", locator: { pageStart: 4 } },
        "desktop",
      ),
    ).toBe("/ai/pdf?baseId=3&docId=7&page=4");
    expect(
      citationHref(
        { ...citation, sourceType: "doc", sourceId: "doc:7", locator: { pageNo: 2 } },
        "mobile",
      ),
    ).toBe("/m/ai/pdf/7?page=2");
    expect(
      citationHref(
        {
          ...citation,
          sourceType: "transcript",
          sourceId: "mooc_item:9#transcript",
          locator: { moocId: 8, startTimeMs: 12345 },
        },
        "mobile",
      ),
    ).toBe("/m/notes/3/mooc/8?itemId=9&t=12.345");
  });

  /** 无效标识不生成链接，缺少位置时保留来源入口。 */
  it("拒绝非法来源并处理缺失定位", () => {
    expect(citationHref({ ...citation, sourceId: "https://evil.test" }, "desktop")).toBeNull();
    expect(citationHref({ ...citation, locator: {} }, "desktop")).toBe("/notes/3/5");
    expect(citationHref({ ...citation, sourceId: "note:0" }, "desktop")).toBeNull();
    expect(citationSchema.safeParse({ ...citation, index: -1 }).success).toBe(false);
    expect(citationLabel({ ...citation, locator: { pageStart: 4 } })).toBe("第 4 页");
  });
});
