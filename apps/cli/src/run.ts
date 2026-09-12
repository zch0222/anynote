import { Command, CommanderError } from "commander";
import type { z } from "zod";
import type { RegisteredCommand } from "./core/command";
import { createContext } from "./core/context";
import { readEnv } from "./core/env";
import { ExitCode, type ExitCodeValue, UsageError, exitCodeFor } from "./core/exit";
import type { CliIo, OutputMode } from "./core/output";
import { writeFailure, writeSuccess } from "./core/output";
import { registry } from "./core/registry";
import { describeField, isBooleanField, optionFlag, shapeOf } from "./core/schema-introspect";
import { CLI_VERSION } from "./version";

const GLOBAL_OPTIONS: Array<[string, string]> = [
  ["--json", "以 JSON 信封输出（stdout 非 TTY 时自动开启）"],
  ["--fields <list>", "逗号分隔的输出字段裁剪"],
  ["--yes", "确认写操作（非 TTY 下的写操作必须显式给出）"],
  ["--dry-run", "只打印将要执行的写操作，不实际发送"],
  ["--profile <name>", "使用指定的凭据 profile"],
  ["--api-url <url>", "网关地址，覆盖 ANYNOTE_API_URL"],
];

const GLOBAL_KEYS = new Set(["json", "fields", "yes", "dryRun", "profile", "apiUrl"]);

type Selection = { command: RegisteredCommand; leaf: Command };

function addGlobalOptions(target: Command): Command {
  for (const [flags, description] of GLOBAL_OPTIONS) target.option(flags, description);
  return target;
}

export function buildProgram(
  commands: RegisteredCommand[],
  onSelect: (selection: Selection) => void,
  io: CliIo,
): Command {
  const program = new Command("anynote")
    .description("Anynote 命令行前端：供人与 agent 操作知识库、笔记")
    // 不能叫 --version：commander 的版本选项会盖过子命令同名选项，
    // 而 `note set --version` 是乐观并发必需的参数。
    .version(CLI_VERSION, "-v, --cli-version")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => io.out(text),
      writeErr: (text) => io.err(text),
    })
    .showHelpAfterError();
  addGlobalOptions(program);

  const groups = new Map<string, Command>();
  for (const command of commands) {
    const segments = command.name.split(" ");
    const head = segments[0] ?? command.name;
    const tail = segments[1];
    let parent = program;
    if (tail) {
      let group = groups.get(head);
      if (!group) {
        group = program.command(head).description(`${head} 相关命令`);
        groups.set(head, group);
      }
      parent = group;
    }

    const leaf = parent.command(tail ?? head).description(command.summary);
    const shape = shapeOf(command.args);
    for (const key of command.positional) {
      leaf.argument(`<${key}>`, describeField(shape[key]));
    }
    for (const [key, field] of Object.entries(shape)) {
      if (command.positional.includes(key)) continue;
      const flag = optionFlag(key);
      leaf.option(isBooleanField(field) ? flag : `${flag} <value>`, describeField(field));
    }
    addGlobalOptions(leaf);
    leaf.action(() => onSelect({ command, leaf }));
  }
  return program;
}

function collectArgs(selection: Selection): Record<string, unknown> {
  const { command, leaf } = selection;
  const values: Record<string, unknown> = {};
  command.positional.forEach((key, index) => {
    const value = leaf.processedArgs[index];
    if (value !== undefined) values[key] = value;
  });
  for (const [key, value] of Object.entries(leaf.opts())) {
    if (GLOBAL_KEYS.has(key)) continue;
    if (value !== undefined) values[key] = value;
  }
  return values;
}

/** 全局开关可以写在命令前也可以写在命令后，两处都要看。 */
function collectGlobals(program: Command, leaf: Command | undefined) {
  const merged = { ...program.opts(), ...(leaf ? leaf.opts() : {}) };
  return {
    json: Boolean(merged.json),
    fields:
      typeof merged.fields === "string"
        ? merged.fields
            .split(",")
            .map((field) => field.trim())
            .filter(Boolean)
        : undefined,
    yes: Boolean(merged.yes),
    dryRun: Boolean(merged.dryRun),
    profile: typeof merged.profile === "string" ? merged.profile : undefined,
    apiUrl: typeof merged.apiUrl === "string" ? merged.apiUrl : undefined,
  };
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(参数)"}: ${issue.message}`)
    .join("; ");
}

export type RunOptions = {
  argv: string[];
  io: CliIo;
  env?: NodeJS.ProcessEnv;
  platform?: string;
  commands?: RegisteredCommand[];
  now?: () => number;
};

/**
 * 执行一次命令，返回退出码。main.ts 之外，单测也直接调用它——
 * 因此这里不允许调用 process.exit，也不允许直接写 process.stdout。
 */
export async function run(options: RunOptions): Promise<ExitCodeValue> {
  const io = options.io;
  const commands = options.commands ?? registry;
  let selection: Selection | undefined;
  const program = buildProgram(
    commands,
    (value) => {
      selection = value;
    },
    io,
  );

  // 解析阶段就可能失败，此时还没有 command 名；输出模式只能先按 argv 与 TTY 猜
  const preMode: OutputMode = options.argv.includes("--json") || !io.isTTY ? "json" : "human";

  try {
    await program.parseAsync(options.argv, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      // 显式 --help / --version 是成功退出（exitCode 0）；
      // "没给命令所以打印帮助" 与选项错误都是用法错误
      if (error.exitCode === 0) return ExitCode.OK;
      // commander 自己已经把可读信息写进 stderr，这里补一份 JSON 信封，
      // 保证任何失败在 JSON 模式下都能从 stdout 一次读到
      writeFailure(io, preMode, "anynote", new UsageError(error.message), ExitCode.USAGE);
      return ExitCode.USAGE;
    }
    throw error;
  }

  if (!selection) {
    program.outputHelp();
    return ExitCode.USAGE;
  }

  const globals = collectGlobals(program, selection.leaf);
  const mode: OutputMode = globals.json || !io.isTTY ? "json" : "human";
  const commandName = selection.command.name;

  try {
    const env = readEnv(
      {
        ...(options.env ?? process.env),
        ...(globals.profile ? { ANYNOTE_PROFILE: globals.profile } : {}),
        ...(globals.apiUrl ? { ANYNOTE_API_URL: globals.apiUrl } : {}),
      },
      options.platform ?? process.platform,
    );
    const outputMode: OutputMode = env.forceJson ? "json" : mode;

    if (selection.command.confirm && !globals.yes && !io.isTTY) {
      throw new UsageError(`写操作 ${commandName} 在非交互环境必须显式加 --yes`);
    }

    const parsed = selection.command.args.safeParse(collectArgs(selection));
    if (!parsed.success) throw new UsageError(formatZodIssues(parsed.error));

    if (globals.dryRun && selection.command.mutating) {
      const preview = {
        command: commandName,
        endpoint: selection.command.endpoint ?? null,
        args: parsed.data,
        executed: false,
      };
      writeSuccess(io, outputMode, commandName, {
        data: preview,
        render: () => `[dry-run] ${commandName} ${selection?.command.endpoint ?? ""}`,
      });
      return ExitCode.OK;
    }

    const ctx = createContext({
      commands,
      env,
      io,
      mode: outputMode,
      yes: globals.yes,
      dryRun: globals.dryRun,
      version: CLI_VERSION,
      ...(options.now ? { now: options.now } : {}),
    });

    const result = await selection.command.run(ctx, parsed.data as Record<string, unknown>);
    writeSuccess(io, outputMode, commandName, result, globals.fields);
    return ExitCode.OK;
  } catch (error) {
    const exitCode = exitCodeFor(error);
    writeFailure(io, mode, commandName, error, exitCode);
    return exitCode;
  }
}
