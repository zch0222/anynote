import { execFile, spawn } from "node:child_process";
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
 *
 * `extraEnv` 用于把 agent 的全局 skill 根目录也隔离到临时目录：
 * skill 安装类用例**绝不能**写到开发者真实的 `~/.claude` / `~/.codex` / `~/.dsh`。
 */
export async function runCli(
  home: string,
  args: string[],
  options: {
    stdin?: string;
    extraEnv?: Record<string, string>;
    withoutApiUrl?: boolean;
    /** 子进程的工作目录；`--local` 靠它向上找项目根 */
    cwd?: string;
  } = {},
): Promise<CliRun> {
  const child = execFileAsync(process.execPath, [CLI_ENTRY, ...args], {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    env: {
      ...process.env,
      ANYNOTE_CONFIG_DIR: home,
      // withoutApiUrl：验证"地址只配过一次就再也不用管"，此时不能有环境变量压着设置文件
      ...(options.withoutApiUrl ? { ANYNOTE_API_URL: "" } : { ANYNOTE_API_URL: GATEWAY }),
      // 避免宿主机上真实的 token 泄漏进测试
      ANYNOTE_TOKEN: "",
      ANYNOTE_PROFILE: "default",
      ...options.extraEnv,
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

export type RunningCli = {
  /** 已收到的 stderr，用于轮询授权链接是否打印出来 */
  stderr: () => string;
  stdout: () => string;
  /** 等待进程退出；拿不到授权链接时用作超时兜底 */
  wait: (timeoutMs?: number) => Promise<CliRun>;
  kill: () => void;
};

/**
 * 起一个**长驻**的 CLI 进程（浏览器授权登录这类命令要等用户操作，不能同步跑完）。
 *
 * stderr 里会先出现授权链接，测试据此拿到回环端口去投递回调——
 * 这正是"用户在某台机器上打开浏览器"的那一步，只不过由测试来扮演浏览器。
 */
export function startCli(
  home: string,
  args: string[],
  options: { extraEnv?: Record<string, string> } = {},
): RunningCli {
  const child = spawn(process.execPath, [CLI_ENTRY, ...args], {
    env: {
      ...process.env,
      ANYNOTE_CONFIG_DIR: home,
      ANYNOTE_API_URL: GATEWAY,
      ANYNOTE_TOKEN: "",
      ANYNOTE_PROFILE: "default",
      ...options.extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const settled = new Promise<CliRun>((resolve) => {
    child.on("close", (code) => {
      let parsed: { ok?: boolean; data?: unknown; error?: CliRun["error"] } | undefined;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch {
        parsed = undefined;
      }
      resolve({
        code: code ?? 0,
        stdout,
        stderr,
        data: parsed?.ok ? parsed.data : undefined,
        error: parsed?.ok === false ? parsed.error : undefined,
      });
    });
  });

  return {
    stdout: () => stdout,
    stderr: () => stderr,
    wait: (timeoutMs = 60_000) =>
      Promise.race([
        settled,
        new Promise<CliRun>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`CLI 进程未在 ${timeoutMs}ms 内退出；stderr=${stderr.slice(0, 500)}`),
              ),
            timeoutMs,
          ),
        ),
      ]),
    kill: () => child.kill("SIGKILL"),
  };
}

/** 轮询等待条件成立（用于等子进程把授权链接打到 stderr）。 */
export async function waitFor<T>(
  read: () => T | undefined,
  label: string,
  timeoutMs = 30_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`等待 ${label} 超时（${timeoutMs}ms）`);
    await new Promise((done) => setTimeout(done, 100));
  }
}
