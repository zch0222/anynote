import { z } from "zod";
import type { CommandExample, CommandStatus, RegisteredCommand } from "../core/command";

export type ManifestCommand = {
  name: string;
  summary: string;
  description: string | null;
  endpoint: string | null;
  mutating: boolean;
  status: CommandStatus;
  positional: string[];
  args: unknown;
  examples: CommandExample[];
};

export type Manifest = {
  cli: string;
  version: string;
  exitCodes: Record<string, number>;
  commands: ManifestCommand[];
};

/**
 * 命令注册表 → manifest。
 *
 * ⚠️ 输出里不允许出现时间戳、机器名、绝对路径等随环境变化的内容：
 * manifest 必须是输入的纯函数，否则 CI 的生成物 diff 门禁会永远失败。
 */
export function buildManifest(
  commands: RegisteredCommand[],
  version: string,
  exitCodes: Record<string, number>,
): Manifest {
  return {
    cli: "anynote",
    version,
    exitCodes,
    commands: [...commands]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((command) => ({
        name: command.name,
        summary: command.summary,
        description: command.description ?? null,
        endpoint: command.endpoint ?? null,
        mutating: command.mutating,
        status: command.status,
        positional: command.positional,
        args: toJsonSchema(command.args),
        examples: command.examples,
      })),
  };
}

/** zod → JSON Schema；个别无法转换的 schema 退化成空对象，不让 manifest 生成中断。 */
export function toJsonSchema(schema: z.ZodObject<z.ZodRawShape>): unknown {
  try {
    return z.toJSONSchema(schema, { io: "input" });
  } catch {
    return { type: "object" };
  }
}
