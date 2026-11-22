import type { ResourceType } from "@/lib/ai/resource-target";
import { docTabDefinition } from "./tabs/doc/definition";
import { kbTabDefinition } from "./tabs/kb/definition";
import { moocItemTabDefinition } from "./tabs/mooc-item/definition";
import { moocTabDefinition } from "./tabs/mooc/definition";
import { noteTabDefinition } from "./tabs/note/definition";
import { taskTabDefinition } from "./tabs/task/definition";
import type { TabDefinition } from "./types";

/**
 * 静态标签注册表：汇总六类资源定义并在加载时校验。
 *
 * @author 称霸幼儿园
 */

export const tabDefinitions: TabDefinition[] = [
  kbTabDefinition,
  noteTabDefinition,
  docTabDefinition,
  moocTabDefinition,
  moocItemTabDefinition,
  taskTabDefinition,
];

const REQUIRED_RESOURCE_TYPES: ResourceType[] = ["kb", "note", "doc", "mooc", "mooc_item", "task"];

/**
 * 校验 kind 唯一、资源类型齐全且与 kind 一致。
 *
 * @param definitions 待校验的定义
 */
export function validateRegistry(definitions: TabDefinition[]): void {
  const kinds = new Set<string>();
  const resourceTypes = new Map<ResourceType, number>();
  for (const definition of definitions) {
    if (kinds.has(definition.kind)) {
      throw new Error(`侧栏标签类型重复：${definition.kind}`);
    }
    kinds.add(definition.kind);
    if (definition.family === "resource") {
      if (!definition.resourceType) {
        throw new Error(`资源标签缺少 resourceType：${definition.kind}`);
      }
      resourceTypes.set(
        definition.resourceType,
        (resourceTypes.get(definition.resourceType) ?? 0) + 1,
      );
    } else if (definition.resourceType) {
      throw new Error(`页面标签不应声明 resourceType：${definition.kind}`);
    }
  }
  for (const type of REQUIRED_RESOURCE_TYPES) {
    const count = resourceTypes.get(type) ?? 0;
    if (count !== 1) {
      throw new Error(`资源类型 ${type} 需要且只能有一个定义，当前 ${count} 个`);
    }
  }
}

/**
 * 按 kind 取标签定义。
 *
 * @param kind 标签类型
 * @returns 标签定义
 */
export function getTabDefinition(kind: string): TabDefinition {
  const definition = tabDefinitions.find((item) => item.kind === kind);
  if (!definition) throw new Error(`未注册的侧栏标签类型：${kind}`);
  return definition;
}

/**
 * 资源类型对应的标签 kind。
 *
 * @param type 资源类型
 * @returns 标签 kind
 */
export function resourceKind(type: ResourceType): string {
  const definition = tabDefinitions.find(
    (item) => item.family === "resource" && item.resourceType === type,
  );
  if (!definition) throw new Error(`未注册的资源类型：${type}`);
  return definition.kind;
}

validateRegistry(tabDefinitions);
