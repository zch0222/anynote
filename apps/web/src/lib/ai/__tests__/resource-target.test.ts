import { describe, expect, it } from "vitest";
import {
  resourceHref,
  resourceKey,
  targetFromCitation,
  targetFromToolItem,
} from "../resource-target";

/**
 * 资源目标解析、身份与完整页面地址测试。
 *
 * @author 称霸幼儿园
 */
describe("资源目标", () => {
  const base = { sourceId: "note:5", kbId: 3 };

  /** 六类资源的桌面与移动地址与旧引用实现逐字节一致。 */
  it("按类型生成两端地址", () => {
    const note = targetFromCitation({
      ...base,
      locator: { sectionPath: "第一章 > 索引", startLine: 12 },
    });
    expect(note && resourceHref(note, "desktop")).toBe(
      "/notes/3/5?section=%E7%AC%AC%E4%B8%80%E7%AB%A0+%3E+%E7%B4%A2%E5%BC%95&line=12",
    );
    expect(note && resourceHref(note, "mobile")).toBe(
      "/m/notes/3/5?section=%E7%AC%AC%E4%B8%80%E7%AB%A0+%3E+%E7%B4%A2%E5%BC%95&line=12",
    );

    const doc = targetFromCitation({
      ...base,
      sourceId: "doc:7",
      locator: { pageStart: 4 },
    });
    expect(doc && resourceHref(doc, "desktop")).toBe("/ai/pdf?baseId=3&docId=7&page=4");
    expect(doc && resourceHref(doc, "mobile")).toBe("/m/ai/pdf/7?page=4");

    const mooc = targetFromCitation({ ...base, sourceId: "mooc:8" });
    expect(mooc && resourceHref(mooc, "desktop")).toBe("/notes/3/mooc/8");
    expect(mooc && resourceHref(mooc, "mobile")).toBe("/m/notes/3/mooc/8");

    const item = targetFromCitation({
      ...base,
      sourceId: "mooc_item:9#transcript",
      locator: { moocId: 8, startTimeMs: 12345 },
    });
    expect(item && resourceHref(item, "desktop")).toBe("/notes/3/mooc/8?itemId=9&t=12.345");
    expect(item && resourceHref(item, "mobile")).toBe("/m/notes/3/mooc/8?itemId=9&t=12.345");

    const task = targetFromCitation({ ...base, sourceId: "task:4" });
    expect(task && resourceHref(task, "desktop")).toBe("/notes/3/tasks/4");
    expect(task && resourceHref(task, "mobile")).toBe("/m/notes/3/tasks/4");

    const kb = targetFromCitation({ ...base, sourceId: "kb:2" });
    expect(kb && resourceHref(kb, "desktop")).toBe("/notes/2/overview");
    expect(kb && resourceHref(kb, "mobile")).toBe("/m/notes/2");
  });

  /** 资料的知识库可选，其余类型缺少知识库时不能生成目标。 */
  it("校验必需字段", () => {
    expect(targetFromCitation({ sourceId: "doc:7" })).not.toBeNull();
    expect(targetFromCitation({ sourceId: "doc:7", kbId: 0 })).not.toBeNull();
    expect(targetFromCitation({ sourceId: "note:5" })).toBeNull();
    expect(targetFromCitation({ sourceId: "mooc:8" })).toBeNull();
    expect(targetFromCitation({ sourceId: "task:4" })).toBeNull();
    expect(targetFromCitation({ sourceId: "mooc_item:9", kbId: 3 })).toBeNull();
    expect(targetFromCitation({ sourceId: "mooc_item:9", kbId: 3, locator: { moocId: 0 } })).toBeNull();
  });

  /** 非法来源标识与越界 id 一律拒绝。 */
  it("拒绝非法来源", () => {
    expect(targetFromCitation({ sourceId: "https://evil.test", kbId: 3 })).toBeNull();
    expect(targetFromCitation({ sourceId: "note:0", kbId: 3 })).toBeNull();
    expect(targetFromCitation({ sourceId: "note:abc", kbId: 3 })).toBeNull();
    expect(targetFromCitation({ sourceId: "note:9007199254740992", kbId: 3 })).toBeNull();
    expect(targetFromCitation({ sourceId: "notice:1", kbId: 3 })).toBeNull();
  });

  /** 身份只由类型与 id 决定，定位与子类型不参与。 */
  it("身份不受定位与子类型影响", () => {
    const transcript = targetFromCitation({
      sourceId: "mooc_item:9#transcript",
      kbId: 3,
      locator: { moocId: 8, startTimeMs: 1000 },
    });
    const summary = targetFromCitation({
      sourceId: "mooc_item:9#summary",
      kbId: 3,
      locator: { moocId: 8, startTimeMs: 9000 },
    });
    expect(transcript && summary && resourceKey(transcript.ref)).toBe("mooc_item:9");
    expect(transcript && resourceKey(transcript.ref)).toBe(summary && resourceKey(summary.ref));
    expect(summary?.locator).toEqual({ seconds: 9, subtype: "summary" });
  });

  /** 工具结果条目与引用使用同一套解析规则。 */
  it("解析工具结果条目", () => {
    const target = targetFromToolItem({
      ref: "note:5",
      title: "复习笔记",
      kbName: "复习库",
      kbId: 3,
      locator: { heading: "索引", line: 12 },
    });
    expect(target).toEqual({
      ref: { type: "note", id: 5, kbId: 3 },
      locator: { section: "索引", line: 12 },
      hint: { title: "复习笔记", kbName: "复习库" },
    });
    expect(target && resourceHref(target, "desktop")).toBe(
      "/notes/3/5?section=%E7%B4%A2%E5%BC%95&line=12",
    );
    expect(targetFromToolItem({ title: "没有来源" })).toBeNull();
    expect(targetFromToolItem({ ref: "note:5" })).toBeNull();
  });

  /** 定位字段缺失或非法时省略对应参数，不生成空参数。 */
  it("处理缺失与非法定位", () => {
    const note = targetFromCitation({ ...base, locator: { section: "  ", line: -1 } });
    expect(note && resourceHref(note, "desktop")).toBe("/notes/3/5");
    const doc = targetFromCitation({ ...base, sourceId: "doc:7", locator: { pageNo: 2.5 } });
    expect(doc && resourceHref(doc, "desktop")).toBe("/ai/pdf?baseId=3&docId=7");
    const item = targetFromCitation({
      ...base,
      sourceId: "mooc_item:9",
      locator: { moocId: 8, startTimeMs: 0 },
    });
    expect(item && resourceHref(item, "desktop")).toBe("/notes/3/mooc/8?itemId=9&t=0");
  });
});
