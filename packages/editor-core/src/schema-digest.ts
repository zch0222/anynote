import type { Schema } from "@tiptap/pm/model";

type SpecValue = string | number | boolean | null | SpecValue[] | { [key: string]: SpecValue };

function plain(value: unknown): SpecValue {
  if (value === undefined || typeof value === "function") return null;
  if (value === null || typeof value !== "object") return value as SpecValue;
  if (Array.isArray(value)) return value.map(plain);
  const result: Record<string, SpecValue> = {};
  for (const key of Object.keys(value).sort()) {
    const item = (value as Record<string, unknown>)[key];
    if (typeof item === "function") continue;
    result[key] = plain(item);
  }
  return result;
}

/**
 * 把 schema 描述成一份稳定的 JSON：节点与 mark 的名称、属性默认值、content 表达式、分组等。
 *
 * 函数（parseDOM、toDOM 等）不进入描述；这份描述变了，说明 schema 变了，
 * `EDITOR_SCHEMA_VERSION` 必须递增。
 *
 * @param schema ProseMirror schema
 * @returns 按键排序的 JSON 字符串
 */
export function describeSchema(schema: Schema): string {
  const describe = (spec: Record<string, unknown>) => {
    const { parseDOM: _parseDOM, toDOM: _toDOM, ...rest } = spec;
    return plain(rest);
  };
  const nodes: Record<string, SpecValue> = {};
  for (const [name, type] of Object.entries(schema.nodes)) {
    nodes[name] = describe(type.spec as Record<string, unknown>);
  }
  const marks: Record<string, SpecValue> = {};
  for (const [name, type] of Object.entries(schema.marks)) {
    marks[name] = describe(type.spec as Record<string, unknown>);
  }
  return JSON.stringify({ nodes, marks, topNode: schema.topNodeType.name });
}
