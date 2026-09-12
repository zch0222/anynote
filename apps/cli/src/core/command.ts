import type { z } from "zod";
import type { CliContext } from "./context";

/**
 * 命令的成熟度。`blocked` 的命令仍然可以在 CLI 里调用（会得到后端的真实报错），
 * 但不会出现在 MCP 工具列表里，manifest 与 skills 也会带上告警。
 */
export type CommandStatus = "stable" | "experimental" | "blocked";

export type CommandExample = { cmd: string; note?: string };

export type CommandResult<T = unknown> = {
  /** JSON 模式下写进信封 data 字段的结构化结果 */
  data: T;
  /** 人类模式的渲染；缺省时由 output.ts 做通用表格 / 键值渲染 */
  render?: (data: T) => string;
  /** 人类模式下写到 stderr 的补充提示，不会污染 stdout */
  notes?: string[];
};

export type CommandDef<Shape extends z.ZodRawShape> = {
  /** 空格分隔的命令路径，如 "note get"。MCP 工具名会把空格换成下划线 */
  name: string;
  /** 一行摘要，进 --help 与 manifest */
  summary: string;
  /** 给 agent 看的长描述：什么时候用、返回什么、失败了怎么办 */
  description?: string;
  args: z.ZodObject<Shape>;
  /** 哪些字段从位置参数取值，按声明顺序对应 argv */
  positional?: (keyof Shape & string)[];
  /** 写操作：驱动 MCP 的 destructiveHint 与文档标注 */
  mutating?: boolean;
  /**
   * 非 TTY 下是否必须显式 `--yes`。默认跟随 `mutating`；
   * 认证类命令虽然也写状态，但不破坏数据，显式设成 false。
   */
  confirm?: boolean;
  /** 映射到的后端端点，仅用于 manifest / 文档，运行时不读 */
  endpoint?: string;
  status?: CommandStatus;
  examples?: CommandExample[];
  run: (ctx: CliContext, args: z.infer<z.ZodObject<Shape>>) => Promise<CommandResult>;
};

/**
 * 构造命令结果并保住 `render` 的入参类型。
 * 直接写对象字面量时，`run` 的声明返回类型会把 T 钉成 unknown，render 里就拿不到字段类型。
 */
export function result<T>(
  data: T,
  extra?: { render?: (data: T) => string; notes?: string[] },
): CommandResult {
  return {
    data,
    ...(extra?.render ? { render: extra.render as (data: unknown) => string } : {}),
    ...(extra?.notes ? { notes: extra.notes } : {}),
  };
}

/** 注册表里存放的、已擦除泛型的命令；解析、manifest、MCP 三处都消费它。 */
export type RegisteredCommand = {
  name: string;
  summary: string;
  description: string | undefined;
  args: z.ZodObject<z.ZodRawShape>;
  positional: string[];
  mutating: boolean;
  confirm: boolean;
  endpoint: string | undefined;
  status: CommandStatus;
  examples: CommandExample[];
  run: (ctx: CliContext, args: Record<string, unknown>) => Promise<CommandResult>;
};

/**
 * 只做类型固定与默认值补齐，不包装运行时行为——注册表必须保持可被静态分析，
 * manifest 生成才能是输入的纯函数。
 */
export function defineCommand<Shape extends z.ZodRawShape>(
  def: CommandDef<Shape>,
): RegisteredCommand {
  return {
    name: def.name,
    summary: def.summary,
    description: def.description,
    args: def.args as unknown as z.ZodObject<z.ZodRawShape>,
    positional: (def.positional ?? []) as string[],
    mutating: def.mutating ?? false,
    confirm: def.confirm ?? def.mutating ?? false,
    endpoint: def.endpoint,
    status: def.status ?? "stable",
    examples: def.examples ?? [],
    run: (ctx, raw) => def.run(ctx, raw as z.infer<z.ZodObject<Shape>>),
  };
}
