import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { type RegisteredCommand, defineCommand, result } from "../core/command";
import { ExitCode } from "../core/exit";
import { run } from "../run";
import { makeIo } from "./helpers";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "anynote-run-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const env = () => ({ ANYNOTE_CONFIG_DIR: dir, ANYNOTE_API_URL: "http://gateway.test" });

/** 命令的 run 用桩：只记录解析结果，不发任何请求。 */
function stubCommand(overrides: Partial<Parameters<typeof defineCommand>[0]> = {}) {
  const seen: Array<Record<string, unknown>> = [];
  const command = defineCommand({
    name: "note set",
    summary: "写入笔记",
    mutating: true,
    args: z.object({
      id: z.coerce.number().int().positive(),
      content: z.string().optional(),
      version: z.string().optional(),
      force: z.boolean().default(false),
    }),
    positional: ["id"],
    run: async (_ctx, args) => {
      seen.push(args as Record<string, unknown>);
      return result({ ok: 1 });
    },
    ...overrides,
  } as Parameters<typeof defineCommand>[0]);
  return { command, seen };
}

async function exec(argv: string[], commands: RegisteredCommand[], isTTY = false) {
  const { io, state } = makeIo(isTTY);
  const code = await run({ argv, io, env: env(), platform: "linux", commands });
  return { code, stdout: state.stdout, stderr: state.stderr };
}

describe("参数解析", () => {
  it("位置参数与选项都能落到 zod", async () => {
    const { command, seen } = stubCommand();
    const { code } = await exec(
      ["note", "set", "42", "--content", "正文", "--version", "17", "--yes"],
      [command],
    );
    expect(code).toBe(ExitCode.OK);
    expect(seen[0]).toEqual({ id: 42, content: "正文", version: "17", force: false });
  });

  it("--version 属于子命令参数，不会被 CLI 自身的版本选项吞掉", async () => {
    // 回归护栏：程序级 --version 曾经盖过 note set --version，直接打印 CLI 版本号并退出
    const { command, seen } = stubCommand();
    const { code, stdout } = await exec(
      ["note", "set", "42", "--content", "x", "--version", "1789149584000", "--yes"],
      [command],
    );
    expect(code).toBe(ExitCode.OK);
    expect(stdout).not.toMatch(/^\d+\.\d+\.\d+\s*$/);
    expect(seen[0]?.version).toBe("1789149584000");
  });

  it("布尔选项不吃值", async () => {
    const { command, seen } = stubCommand();
    await exec(["note", "set", "42", "--content", "x", "--force", "--yes"], [command]);
    expect(seen[0]).toMatchObject({ force: true });
  });

  it("zod 校验失败 → 退出码 2，且不执行命令", async () => {
    const { command, seen } = stubCommand();
    const { code, stdout } = await exec(["note", "set", "-3", "--yes"], [command]);
    expect(code).toBe(ExitCode.USAGE);
    expect(seen).toHaveLength(0);
    expect(JSON.parse(stdout).error.code).toBe("UsageError");
  });

  it("未知命令 → 退出码 2", async () => {
    const { command } = stubCommand();
    const { code } = await exec(["nope"], [command]);
    expect(code).toBe(ExitCode.USAGE);
  });

  it("不给命令时返回 2：帮助进 stderr，stdout 只放机器可读的失败信封", async () => {
    const { command } = stubCommand();
    const { code, stdout, stderr } = await exec([], [command]);
    expect(code).toBe(ExitCode.USAGE);
    expect(JSON.parse(stdout)).toMatchObject({ ok: false, error: { exitCode: 2 } });
    expect(stderr).toContain("Usage:");
  });

  it("人类模式下不给命令时直接看到帮助", async () => {
    const { command } = stubCommand();
    const { code, stderr } = await exec([], [command], true);
    expect(code).toBe(ExitCode.USAGE);
    expect(stderr).toContain("Usage:");
  });

  it("--help 返回 0", async () => {
    const { command } = stubCommand();
    const { code } = await exec(["--help"], [command]);
    expect(code).toBe(ExitCode.OK);
  });

  it("两段命令名不会被一段前缀吞掉", async () => {
    const list = defineCommand({
      name: "note list",
      summary: "列笔记",
      args: z.object({ base: z.coerce.number() }),
      run: async () => result("list"),
    });
    const { command } = stubCommand();
    const { stdout } = await exec(["note", "list", "--base", "7"], [command, list]);
    expect(JSON.parse(stdout).command).toBe("note list");
  });
});

describe("可重复选项（数组字段）", () => {
  /** 形状与 skill install --agent 一致：可重复、带默认值、同级还有布尔开关。 */
  function agentCommand() {
    const seen: Array<Record<string, unknown>> = [];
    const command = defineCommand({
      name: "skill install",
      summary: "安装 skill",
      args: z.object({
        agent: z.array(z.enum(["claude", "codex", "dsh", "all"])).default(["all"]),
        force: z.boolean().default(false),
      }),
      run: async (_ctx, args) => {
        seen.push(args as Record<string, unknown>);
        return result({ ok: 1 });
      },
    } as Parameters<typeof defineCommand>[0]);
    return { command, seen };
  }

  it("--agent 重复给出时收集成数组", async () => {
    // 回归护栏：漏掉数组声明时这里解析成字符串 "dsh"，zod 会报
    // "agent: Invalid input: expected array, received string"
    const { command, seen } = agentCommand();
    const { code } = await exec(["skill", "install", "--agent=claude", "--agent=dsh"], [command]);
    expect(code).toBe(ExitCode.OK);
    expect(seen[0]?.agent).toEqual(["claude", "dsh"]);
  });

  it("--agent 写成两个参数也收集成数组", async () => {
    const { command, seen } = agentCommand();
    const { code } = await exec(
      ["skill", "install", "--agent", "claude", "--agent", "dsh"],
      [command],
    );
    expect(code).toBe(ExitCode.OK);
    expect(seen[0]?.agent).toEqual(["claude", "dsh"]);
  });

  it("不给 --agent 时走 zod 默认值", async () => {
    const { command, seen } = agentCommand();
    await exec(["skill", "install"], [command]);
    expect(seen[0]?.agent).toEqual(["all"]);
  });

  it("数组选项不会吞掉紧随其后的布尔开关", async () => {
    // 变参声明 `<value...>` 会连 --force 一起吃进去，所以用收集函数实现
    const { command, seen } = agentCommand();
    const { code } = await exec(["skill", "install", "--agent=claude", "--force"], [command]);
    expect(code).toBe(ExitCode.OK);
    expect(seen[0]).toEqual({ agent: ["claude"], force: true });
  });
});

describe("写操作守卫", () => {
  it("非 TTY 缺 --yes → 退出码 2 且零请求", async () => {
    const { command, seen } = stubCommand();
    const { code, stdout } = await exec(["note", "set", "42", "--content", "x"], [command]);
    expect(code).toBe(ExitCode.USAGE);
    expect(seen).toHaveLength(0);
    expect(JSON.parse(stdout).error.message).toContain("--yes");
  });

  it("TTY 下不强制 --yes", async () => {
    const { command, seen } = stubCommand();
    const { code } = await exec(
      ["note", "set", "42", "--content", "x", "--version", "1"],
      [command],
      true,
    );
    expect(code).toBe(ExitCode.OK);
    expect(seen).toHaveLength(1);
  });

  it("confirm: false 的写操作不需要 --yes", async () => {
    const { command, seen } = stubCommand({ confirm: false } as never);
    const { code } = await exec(["note", "set", "42", "--content", "x"], [command]);
    expect(code).toBe(ExitCode.OK);
    expect(seen).toHaveLength(1);
  });

  it("只读命令不需要 --yes", async () => {
    const readonly = defineCommand({
      name: "base list",
      summary: "列知识库",
      args: z.object({}),
      run: async () => result([]),
    });
    const { code } = await exec(["base", "list"], [readonly]);
    expect(code).toBe(ExitCode.OK);
  });
});

describe("--dry-run", () => {
  it("写操作只打印预览，不执行", async () => {
    const { command, seen } = stubCommand();
    const { code, stdout } = await exec(
      ["note", "set", "42", "--content", "x", "--yes", "--dry-run"],
      [command],
    );
    expect(code).toBe(ExitCode.OK);
    expect(seen).toHaveLength(0);
    expect(JSON.parse(stdout).data).toMatchObject({ command: "note set", executed: false });
  });

  it("只读命令照常执行", async () => {
    const calls = vi.fn(async () => result([]));
    const readonly = defineCommand({
      name: "base list",
      summary: "列知识库",
      args: z.object({}),
      run: calls,
    });
    await exec(["base", "list", "--dry-run"], [readonly]);
    expect(calls).toHaveBeenCalledTimes(1);
  });
});

describe("输出模式", () => {
  it("非 TTY 自动 JSON", async () => {
    const readonly = defineCommand({
      name: "base list",
      summary: "列知识库",
      args: z.object({}),
      run: async () => result([{ id: 1, name: "库" }]),
    });
    const { stdout } = await exec(["base", "list"], [readonly]);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, command: "base list" });
  });

  it("TTY 默认人类可读，加 --json 切回信封", async () => {
    const readonly = defineCommand({
      name: "base list",
      summary: "列知识库",
      args: z.object({}),
      run: async () => result([{ id: 1 }]),
    });
    const human = await exec(["base", "list"], [readonly], true);
    expect(human.stdout).not.toContain('"ok"');
    const json = await exec(["base", "list", "--json"], [readonly], true);
    expect(JSON.parse(json.stdout).ok).toBe(true);
  });

  it("--fields 裁剪输出", async () => {
    const readonly = defineCommand({
      name: "base list",
      summary: "列知识库",
      args: z.object({}),
      run: async () => result([{ id: 1, name: "库", extra: "x" }]),
    });
    const { stdout } = await exec(["base", "list", "--fields", "id,name"], [readonly]);
    expect(JSON.parse(stdout).data).toEqual([{ id: 1, name: "库" }]);
  });

  it("全局开关写在命令前也生效", async () => {
    const readonly = defineCommand({
      name: "base list",
      summary: "列知识库",
      args: z.object({}),
      run: async () => result([{ id: 1, extra: 2 }]),
    });
    const { stdout } = await exec(["--fields", "id", "base", "list"], [readonly], true);
    expect(stdout.trim()).toBe("id\n--\n1");
  });
});

describe("设置持久化", () => {
  /** 读回命令实际拿到的 apiUrl：run 的返回值只有退出码，所以从 ctx 里取。 */
  function envProbe() {
    const seen: string[] = [];
    const command = defineCommand({
      name: "base list",
      summary: "列知识库",
      args: z.object({}),
      run: async (ctx) => {
        seen.push(`${ctx.env.apiUrl}|${ctx.env.apiUrlSource}`);
        return result({ apiUrl: ctx.env.apiUrl, source: ctx.env.apiUrlSource });
      },
    });
    return { command, seen };
  }

  it("设置文件里的 api-url 在没有环境变量时生效", async () => {
    await fs.writeFile(
      path.join(dir, "settings.json"),
      JSON.stringify({ version: 1, apiUrl: "http://192.168.3.90:8080" }),
      "utf8",
    );
    const { command, seen } = envProbe();
    const { io, state } = makeIo();
    // 注意：显式不给 ANYNOTE_API_URL，模拟"只配过一次就再也不用管"
    await run({
      argv: ["base", "list"],
      io,
      env: { ANYNOTE_CONFIG_DIR: dir },
      platform: "linux",
      commands: [command],
    });
    expect(seen).toEqual(["http://192.168.3.90:8080|file"]);
    expect(state.stdout).toContain("192.168.3.90");
  });

  it("ANYNOTE_API_URL 优先级高于设置文件", async () => {
    await fs.writeFile(
      path.join(dir, "settings.json"),
      JSON.stringify({ version: 1, apiUrl: "http://from-file.test" }),
      "utf8",
    );
    const { command, seen } = envProbe();
    await exec(["base", "list"], [command]);
    expect(seen).toEqual(["http://gateway.test|env"]);
  });

  it("--api-url 优先级最高，且只影响本次调用", async () => {
    await fs.writeFile(
      path.join(dir, "settings.json"),
      JSON.stringify({ version: 1, apiUrl: "http://from-file.test" }),
      "utf8",
    );
    const { command, seen } = envProbe();
    await exec(["base", "list", "--api-url", "http://flag.test"], [command]);
    expect(seen).toEqual(["http://flag.test|env"]);
    // 环境变量在，仍是 env；但只要去掉环境变量的那一路，文件值还在
    const settings = JSON.parse(await fs.readFile(path.join(dir, "settings.json"), "utf8"));
    expect(settings.apiUrl).toBe("http://from-file.test");
  });

  it("设置文件损坏时回落默认值，不让所有命令都起不来", async () => {
    await fs.writeFile(path.join(dir, "settings.json"), "{ 坏的", "utf8");
    const { command, seen } = envProbe();
    const { io } = makeIo();
    await run({
      argv: ["base", "list"],
      io,
      env: { ANYNOTE_CONFIG_DIR: dir },
      platform: "linux",
      commands: [command],
    });
    expect(seen).toEqual(["http://localhost:8080|default"]);
  });
});

describe("异常映射", () => {
  it("命令抛 ApiError 时按业务码给退出码", async () => {
    const { ApiError } = await import("@anynote/api-core");
    const failing = defineCommand({
      name: "note set",
      summary: "写入笔记",
      args: z.object({}),
      run: async () => {
        throw new ApiError(200, "A0409", "冲突");
      },
    });
    const { code, stdout } = await exec(["note", "set"], [failing]);
    expect(code).toBe(ExitCode.CONFLICT);
    expect(JSON.parse(stdout).error).toMatchObject({ code: "A0409", exitCode: 5 });
  });

  it("凭据缺失时退出码 2 并提示登录", async () => {
    const needsAuth = defineCommand({
      name: "auth whoami",
      summary: "我是谁",
      args: z.object({}),
      run: async (ctx) => result(await ctx.credentials.accessToken()),
    });
    const { code, stdout } = await exec(["auth", "whoami"], [needsAuth]);
    expect(code).toBe(ExitCode.USAGE);
    expect(JSON.parse(stdout).error.message).toContain("auth login");
  });
});
