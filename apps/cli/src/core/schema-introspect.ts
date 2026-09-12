import type { z } from "zod";

type ZodInternals = {
  _zod?: { def?: { type?: string; innerType?: unknown } };
  description?: string;
};

/** 剥掉 optional / default / nullable 等包装，拿到最内层的基础类型名。 */
export function baseTypeOf(schema: unknown): string {
  let current = schema as ZodInternals | undefined;
  for (let depth = 0; depth < 10 && current; depth += 1) {
    const def = current._zod?.def;
    if (!def?.type) return "unknown";
    if (def.innerType) {
      current = def.innerType as ZodInternals;
      continue;
    }
    return def.type;
  }
  return "unknown";
}

export function isBooleanField(schema: unknown): boolean {
  return baseTypeOf(schema) === "boolean";
}

export function describeField(schema: unknown): string {
  return (schema as ZodInternals).description ?? "";
}

/** 驼峰字段名 → 命令行 flag：passwordStdin → --password-stdin */
export function optionFlag(name: string): string {
  return `--${name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`;
}

export function shapeOf(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  return schema.shape as Record<string, unknown>;
}
