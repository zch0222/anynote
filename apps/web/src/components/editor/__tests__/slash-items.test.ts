import { createSlashItems, filterSlashItems } from "@/components/editor/extensions/slash-items";
import { describe, expect, it } from "vitest";

const items = createSlashItems({});

describe("Slash 菜单命令清单", () => {
  it("覆盖里程碑要求的全部命令", () => {
    const titles = items.map((item) => item.title);
    for (const expected of [
      "一级标题",
      "二级标题",
      "三级标题",
      "无序列表",
      "有序列表",
      "任务列表",
      "引用",
      "代码块",
      "表格",
      "图片",
      "提示块",
      "行内公式",
      "块级公式",
      "分割线",
    ]) {
      expect(titles).toContain(expected);
    }
  });

  it("每项都有可用分组与唯一标识字段", () => {
    for (const item of items) {
      expect(item.group.length).toBeGreaterThan(0);
      expect(item.keywords.length).toBeGreaterThan(0);
      expect(typeof item.run).toBe("function");
    }
  });

  it("空查询返回全部命令", () => {
    expect(filterSlashItems(items, "")).toHaveLength(items.length);
    expect(filterSlashItems(items, "   ")).toHaveLength(items.length);
  });

  it("按中文标题过滤", () => {
    const result = filterSlashItems(items, "表格");
    expect(result.map((item) => item.title)).toEqual(["表格"]);
  });

  it("按英文关键词过滤", () => {
    const result = filterSlashItems(items, "code");
    expect(result.map((item) => item.title)).toContain("代码块");
  });

  it("同时匹配分组名", () => {
    const groups = filterSlashItems(items, "数学").map((item) => item.group);
    expect(groups.every((group) => group === "数学")).toBe(true);
  });

  it("无匹配返回空数组", () => {
    expect(filterSlashItems(items, "不存在的命令xyz")).toEqual([]);
  });
});
