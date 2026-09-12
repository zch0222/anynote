import { ApiError } from "@anynote/api-core";
import type { CommandResult } from "./command";
import type { ExitCodeValue } from "./exit";

export type OutputMode = "json" | "human";

export type CliIo = {
  out: (chunk: string) => void;
  err: (chunk: string) => void;
  isTTY: boolean;
};

/** 成功信封。data 之外不放任何东西，agent 直接 `jq .data`。 */
export function successEnvelope(command: string, data: unknown) {
  return { ok: true as const, command, data };
}

export function failureEnvelope(command: string, error: unknown, exitCode: ExitCodeValue) {
  if (error instanceof ApiError) {
    return {
      ok: false as const,
      command,
      error: {
        code: error.code,
        message: error.message,
        status: error.status,
        ...(error.traceId ? { traceId: error.traceId } : {}),
        exitCode,
      },
    };
  }
  return {
    ok: false as const,
    command,
    error: {
      code: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      exitCode,
    },
  };
}

/** 宽字符按 2 列算，保证 CJK 表格不会错位。 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    width += wide ? 2 : 1;
  }
  return width;
}

function pad(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** 对象数组渲染成对齐表格；其余结构退化成键值行或标量。 */
export function renderHuman(data: unknown): string {
  if (data === null || data === undefined) return "";
  if (Array.isArray(data)) {
    if (data.length === 0) return "(空)";
    const rows = data.filter((row): row is Record<string, unknown> => isPlainObject(row));
    if (rows.length !== data.length) return data.map(scalar).join("\n");
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const widths = columns.map((column) =>
      Math.max(displayWidth(column), ...rows.map((row) => displayWidth(scalar(row[column])))),
    );
    const header = columns.map((column, i) => pad(column, widths[i] ?? 0)).join("  ");
    const divider = columns.map((_, i) => "-".repeat(widths[i] ?? 0)).join("  ");
    const body = rows.map((row) =>
      columns.map((column, i) => pad(scalar(row[column]), widths[i] ?? 0)).join("  "),
    );
    return [header, divider, ...body].join("\n");
  }
  if (isPlainObject(data)) {
    const keys = Object.keys(data);
    const width = Math.max(0, ...keys.map(displayWidth));
    return keys.map((key) => `${pad(key, width)}  ${scalar(data[key])}`).join("\n");
  }
  return scalar(data);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `--fields a,b` 裁剪：对象取子集，对象数组逐条取子集，其余原样返回。
 * 这是给 agent 控上下文预算用的，不是展示逻辑。
 */
export function pickFields(data: unknown, fields: string[] | undefined): unknown {
  if (!fields || fields.length === 0) return data;
  const pick = (row: Record<string, unknown>) =>
    Object.fromEntries(fields.filter((field) => field in row).map((field) => [field, row[field]]));
  if (Array.isArray(data)) return data.map((row) => (isPlainObject(row) ? pick(row) : row));
  if (isPlainObject(data)) return pick(data);
  return data;
}

export function writeSuccess(
  io: CliIo,
  mode: OutputMode,
  command: string,
  result: CommandResult,
  fields?: string[],
): void {
  const data = pickFields(result.data, fields);
  if (mode === "json") {
    io.out(`${JSON.stringify(successEnvelope(command, data))}\n`);
    return;
  }
  const rendered = result.render ? result.render(result.data as never) : renderHuman(data);
  if (rendered.length > 0) io.out(`${rendered}\n`);
  for (const note of result.notes ?? []) io.err(`${note}\n`);
}

export function writeFailure(
  io: CliIo,
  mode: OutputMode,
  command: string,
  error: unknown,
  exitCode: ExitCodeValue,
): void {
  const envelope = failureEnvelope(command, error, exitCode);
  if (mode === "json") {
    // 失败信封同样走 stdout：agent 用一次读取拿到全部结果，不必同时抓两个流
    io.out(`${JSON.stringify(envelope)}\n`);
    return;
  }
  io.err(`错误 [${envelope.error.code}] ${envelope.error.message}\n`);
}
