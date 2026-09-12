import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CLI_ENTRY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "anynote.mjs",
);

export const GATEWAY = process.env.ANYNOTE_API_URL ?? "http://localhost:8080";

export type CliRun = {
  code: number;
  stdout: string;
  stderr: string;
  /** JSON 信封的 data 字段；失败信封时为 undefined */
  data: unknown;
  error: { code: string; message: string; exitCode: number } | undefined;
};

export async function ensureBuilt(): Promise<void> {
  try {
    await fs.access(CLI_ENTRY);
  } catch {
    throw new Error(`找不到 ${CLI_ENTRY}，先执行 pnpm --filter @anynote/cli build`);
  }
}

export async function makeHome(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "anynote-e2e-"));
}

/** 随机测试账号：用户名 6-15 位字母数字，口令必须同时含大小写与数字。 */
export function randomAccount() {
  return {
    username: `e2e${randomBytes(4).toString("hex")}`,
    password: `Aa1${randomBytes(4).toString("hex")}`,
    nickname: "CLI 端到端临时账号",
  };
}

/**
 * 跑一次真实 CLI 进程。stdout 非 TTY，因此命令默认走 JSON 信封，
 * 这正是 agent 看到的形态。
 */
export async function runCli(
  home: string,
  args: string[],
  options: { stdin?: string } = {},
): Promise<CliRun> {
  const child = execFileAsync(process.execPath, [CLI_ENTRY, ...args], {
    env: {
      ...process.env,
      ANYNOTE_CONFIG_DIR: home,
      ANYNOTE_API_URL: GATEWAY,
      // 避免宿主机上真实的 token 泄漏进测试
      ANYNOTE_TOKEN: "",
      ANYNOTE_PROFILE: "default",
    },
    maxBuffer: 16 * 1024 * 1024,
  });

  if (options.stdin !== undefined) {
    child.child.stdin?.end(options.stdin);
  }

  let stdout = "";
  let stderr = "";
  let code = 0;
  try {
    const settled = await child;
    stdout = settled.stdout;
    stderr = settled.stderr;
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    stdout = failure.stdout ?? "";
    stderr = failure.stderr ?? "";
    code = typeof failure.code === "number" ? failure.code : 1;
  }

  let parsed: { ok?: boolean; data?: unknown; error?: CliRun["error"] } | undefined;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    parsed = undefined;
  }

  return {
    code,
    stdout,
    stderr,
    data: parsed?.ok ? parsed.data : undefined,
    error: parsed?.ok === false ? parsed.error : undefined,
  };
}

/** 断言命令成功并返回 data；失败时把信封打进错误信息，便于定位。 */
export function expectOk(run: CliRun, label: string): unknown {
  if (run.code !== 0 || run.data === undefined) {
    throw new Error(
      `${label} 失败：exit=${run.code} stdout=${run.stdout.slice(0, 500)} stderr=${run.stderr.slice(0, 300)}`,
    );
  }
  return run.data;
}
