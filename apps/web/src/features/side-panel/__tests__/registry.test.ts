import { FileText } from "lucide-react";
import { describe, expect, it } from "vitest";
import { getTabDefinition, tabDefinitions, validateRegistry } from "../registry";
import type { TabDefinition } from "../types";

/**
 * 侧栏注册表校验测试。
 *
 * @author 称霸幼儿园
 */
function pageDefinition(kind: string): TabDefinition {
  return {
    kind,
    family: "page",
    mobile: true,
    icon: FileText,
    typeLabel: kind,
    useTitle: () => ({ title: null, unavailable: false }),
    body: () => Promise.resolve({ default: () => null }),
  };
}

describe("侧栏注册表", () => {
  /** 六类资源各有且只有一个定义。 */
  it("内置注册表完整", () => {
    expect(tabDefinitions.map((definition) => definition.kind).sort()).toEqual([
      "doc",
      "kb",
      "mooc",
      "mooc_item",
      "note",
      "task",
    ]);
    expect(getTabDefinition("note").typeLabel).toBe("笔记");
  });

  /** kind 重复时抛错。 */
  it("拒绝重复的 kind", () => {
    expect(() => validateRegistry([...tabDefinitions, pageDefinition("note")])).toThrow(
      "侧栏标签类型重复",
    );
  });

  /** 资源类型缺失时抛错。 */
  it("拒绝缺失的资源类型", () => {
    expect(() =>
      validateRegistry(tabDefinitions.filter((definition) => definition.kind !== "task")),
    ).toThrow("资源类型 task");
  });

  /** 同一资源类型出现两次时抛错。 */
  it("拒绝重复的资源类型", () => {
    expect(() =>
      validateRegistry([
        ...tabDefinitions,
        { ...(tabDefinitions[0] as TabDefinition), kind: "kb2", resourceType: "kb" },
      ]),
    ).toThrow("资源类型 kb");
  });

  /** 页面标签不能声明资源类型。 */
  it("拒绝页面标签声明资源类型", () => {
    expect(() =>
      validateRegistry([...tabDefinitions, { ...pageDefinition("page"), resourceType: "note" }]),
    ).toThrow("页面标签不应声明 resourceType");
  });
});
