import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bundledSkills } from "../bundled";
import { configGet, configPath, configSet, configUnset, doctor } from "../commands/meta";
import { resolveTargets, skillInstall, skillList, skillUninstall } from "../commands/skill";
import { UsageError } from "../core/exit";
import { makeContext } from "./helpers";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "anynote-skillcmd-"));
  // 三家 agent 的根目录都指到临时目录：绝不允许命令真的写进开发者的 ~/.claude
  vi.stubEnv("HOME", dir);
  vi.stubEnv("USERPROFILE", dir);
  vi.stubEnv("CLAUDE_CONFIG_DIR", path.join(dir, ".claude"));
  vi.stubEnv("CODEX_HOME", path.join(dir, ".codex"));
  vi.stubEnv("DSH_HOME", path.join(dir, ".dsh"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

const claudeSkills = () => path.join(dir, ".claude", "skills");
const codexSkills = () => path.join(dir, ".codex", "skills");
const dshSkills = () => path.join(dir, ".dsh", "skills");

function context() {
  return makeContext({ configDir: dir }).ctx;
}

describe("resolveTargets", () => {
  it("缺省与 all 都展开成三家", () => {
    expect(resolveTargets([])).toEqual(["claude", "codex", "dsh"]);
    expect(resolveTargets(["all"])).toEqual(["claude", "codex", "dsh"]);
  });

  it("去重并按固定顺序输出，与传入顺序无关", () => {
    expect(resolveTargets(["dsh", "claude", "dsh"])).toEqual(["claude", "dsh"]);
  });

  it("all 与具体名字混给时取并集", () => {
    expect(resolveTargets(["claude", "all"])).toEqual(["claude", "codex", "dsh"]);
  });
});

describe("skill install", () => {
  it("缺省装到三家，返回每个 skill 的落地路径", async () => {
    const output = await skillInstall.run(context(), {
      agent: ["all"],
      force: false,
      root: undefined,
    });
    const data = output.data as {
      installed: Array<{ agent: string; action: string; path: string }>;
      skills: string[];
    };
    expect(data.skills).toEqual(bundledSkills.map((skill) => skill.name));
    expect(data.installed).toHaveLength(bundledSkills.length * 3);
    for (const root of [claudeSkills(), codexSkills(), dshSkills()]) {
      for (const skill of bundledSkills) {
        await expect(fs.access(path.join(root, skill.name, "SKILL.md"))).resolves.toBeUndefined();
      }
    }
  });

  it("只装指定 agent 时不动另外两家", async () => {
    await skillInstall.run(context(), { agent: ["claude"], force: false, root: undefined });
    await expect(fs.access(claudeSkills())).resolves.toBeUndefined();
    await expect(fs.access(codexSkills())).rejects.toThrow();
    await expect(fs.access(dshSkills())).rejects.toThrow();
  });

  it("装出来的 SKILL.md 带当前 CLI 版本戳", async () => {
    await skillInstall.run(context(), { agent: ["claude"], force: false, root: undefined });
    const body = await fs.readFile(path.join(claudeSkills(), "anynote-cli", "SKILL.md"), "utf8");
    expect(body).toContain("anynote-cli-version: 0.0.0-test");
  });

  it("重复安装是幂等的", async () => {
    await skillInstall.run(context(), { agent: ["claude"], force: false, root: undefined });
    const second = await skillInstall.run(context(), {
      agent: ["claude"],
      force: false,
      root: undefined,
    });
    const data = second.data as { installed: Array<{ action: string }> };
    expect(data.installed.every((entry) => entry.action === "unchanged")).toBe(true);
  });

  it("目标已存在用户手写的同名 skill 时跳过该 agent，其余照装", async () => {
    const foreign = path.join(claudeSkills(), "anynote-cli");
    await fs.mkdir(foreign, { recursive: true });
    await fs.writeFile(
      path.join(foreign, "SKILL.md"),
      "---\nname: anynote-cli\ndescription: 我自己的\n---\n",
      "utf8",
    );

    const output = await skillInstall.run(context(), {
      agent: ["all"],
      force: false,
      root: undefined,
    });
    const data = output.data as {
      installed: Array<{ agent: string }>;
      skipped: string[];
    };
    // claude 被整体跳过（anynote-cli 撞名），codex / dsh 正常装完
    expect(data.installed.every((entry) => entry.agent !== "claude")).toBe(true);
    expect(data.installed).toHaveLength(bundledSkills.length * 2);
    expect(data.skipped[0]).toContain("不是 anynote CLI 安装的");
    // 用户的内容原封不动
    await expect(fs.readFile(path.join(foreign, "SKILL.md"), "utf8")).resolves.toContain(
      "我自己的",
    );
  });

  it("all 都被占用且没有 --force 时以用法错误退出", async () => {
    for (const root of [claudeSkills(), codexSkills(), dshSkills()]) {
      const target = path.join(root, "anynote-cli");
      await fs.mkdir(target, { recursive: true });
      await fs.writeFile(
        path.join(target, "SKILL.md"),
        "---\nname: anynote-cli\ndescription: x\n---\n",
        "utf8",
      );
    }
    await expect(
      skillInstall.run(context(), { agent: ["all"], force: false, root: undefined }),
    ).rejects.toThrow(UsageError);
  });

  it("--force 覆盖用户手写的同名 skill", async () => {
    const foreign = path.join(claudeSkills(), "anynote-cli");
    await fs.mkdir(foreign, { recursive: true });
    await fs.writeFile(
      path.join(foreign, "SKILL.md"),
      "---\nname: anynote-cli\ndescription: 我自己的\n---\n",
      "utf8",
    );
    await skillInstall.run(context(), { agent: ["claude"], force: true, root: undefined });
    const body = await fs.readFile(path.join(foreign, "SKILL.md"), "utf8");
    expect(body).toContain("anynote-cli-version");
    expect(body).not.toContain("我自己的");
  });

  it("--root 把 Claude Code 的安装位置重定向过去", async () => {
    const alt = path.join(dir, "alt-config");
    await skillInstall.run(context(), { agent: ["claude"], force: false, root: alt });
    await expect(
      fs.access(path.join(alt, "skills", "anynote-cli", "SKILL.md")),
    ).resolves.toBeUndefined();
  });

  it("人类模式渲染出 agent、动作与路径", async () => {
    const output = await skillInstall.run(context(), {
      agent: ["dsh"],
      force: false,
      root: undefined,
    });
    const text = output.render?.(output.data) ?? "";
    expect(text).toContain("dsh");
    expect(text).toContain(dshSkills());
    expect(text).toContain("重启 agent 会话后生效");
  });
});

describe("skill install --local", () => {
  /**
   * 造一个假的"项目"：<dir>/project 带 .git，命令从 <dir>/project/apps/cli 跑。
   * installDeps 用 process.cwd() 找项目根，所以这里 stub cwd。
   */
  async function makeProject() {
    const project = path.join(dir, "project");
    await fs.mkdir(path.join(project, ".git"), { recursive: true });
    const cwd = path.join(project, "apps", "cli");
    await fs.mkdir(cwd, { recursive: true });
    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    return project;
  }

  it("装进项目根下的三个项目级目录，而不是全局目录", async () => {
    const project = await makeProject();
    const output = await skillInstall.run(context(), {
      agent: ["all"],
      local: true,
      force: false,
      root: undefined,
    });

    // codex 的项目级目录是 .agents（与 dsh 的 project-agents 同一约定），claude 是 .claude
    for (const sub of [".claude", ".agents", ".dsh"]) {
      for (const skill of bundledSkills) {
        await expect(
          fs.access(path.join(project, sub, "skills", skill.name, "SKILL.md")),
        ).resolves.toBeUndefined();
      }
    }
    expect(output.data).toMatchObject({ scope: "local", projectRoot: project });
    // 全局目录完全没被碰
    for (const global of [claudeSkills(), codexSkills(), dshSkills()]) {
      await expect(fs.access(global)).rejects.toThrow();
    }
  });

  it("项目级安装也带版本戳，且幂等", async () => {
    const project = await makeProject();
    const first = await skillInstall.run(context(), {
      agent: ["dsh"],
      local: true,
      force: false,
      root: undefined,
    });
    expect(first.data).toMatchObject({ scope: "local", projectRoot: project });
    const body = await fs.readFile(
      path.join(project, ".dsh", "skills", "anynote-cli", "SKILL.md"),
      "utf8",
    );
    expect(body).toContain("anynote-cli-version");

    const again = await skillInstall.run(context(), {
      agent: ["dsh"],
      local: true,
      force: false,
      root: undefined,
    });
    const installed = (again.data as { installed: Array<{ action: string }> }).installed;
    expect(installed.every((entry) => entry.action === "unchanged")).toBe(true);
  });

  it("本地与全局互不干扰：--local 装的不会出现在全局 list 里", async () => {
    await makeProject();
    await skillInstall.run(context(), {
      agent: ["claude"],
      local: true,
      force: false,
      root: undefined,
    });

    const localRows = (await skillList.run(context(), { local: true, root: undefined })).data as {
      rows: Array<{ installed: boolean }>;
    };
    expect(localRows.rows.some((row) => row.installed)).toBe(true);

    const globalRows = (await skillList.run(context(), { local: false, root: undefined })).data as {
      rows: Array<{ installed: boolean }>;
    };
    expect(globalRows.rows.every((row) => !row.installed)).toBe(true);
  });

  it("--local uninstall 只删项目级的", async () => {
    const project = await makeProject();
    await skillInstall.run(context(), {
      agent: ["all"],
      local: true,
      force: false,
      root: undefined,
    });
    await skillInstall.run(context(), {
      agent: ["all"],
      local: false,
      force: false,
      root: undefined,
    });

    const removed = (
      await skillUninstall.run(context(), { agent: ["all"], local: true, root: undefined })
    ).data as { removed: unknown[] };
    expect(removed.removed).toHaveLength(bundledSkills.length * 3);

    await expect(fs.access(path.join(project, ".dsh", "skills", "anynote-cli"))).rejects.toThrow();
    // 全局那套还在
    await expect(fs.access(path.join(dshSkills(), "anynote-cli"))).resolves.toBeUndefined();
  });

  it("拒绝覆盖本仓库的 skill 源文（bundled.ts 的输入），且 --force 也不行", async () => {
    // 造一个"源文"：内容与打包进来的 SKILL.md 逐字节相同、且没有版本戳
    const project = path.join(dir, "project");
    await fs.mkdir(path.join(project, ".git"), { recursive: true });
    const cwd = path.join(project, "apps", "cli");
    await fs.mkdir(cwd, { recursive: true });
    vi.spyOn(process, "cwd").mockReturnValue(cwd);

    const cli = bundledSkills.find((skill) => skill.name === "anynote-cli");
    const sourceDir = path.join(project, ".claude", "skills", "anynote-cli");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, "SKILL.md"), cli?.files["SKILL.md"] ?? "", "utf8");

    // --force 也不能覆盖源文；但另外两家没有被挡，照常安装
    const output = await skillInstall.run(context(), {
      agent: ["all"],
      local: true,
      force: true,
      root: undefined,
    });
    const data = output.data as {
      installed: Array<{ agent: string }>;
      skipped: string[];
    };
    expect(data.installed.every((entry) => entry.agent !== "claude")).toBe(true);
    expect(data.installed).toHaveLength(bundledSkills.length * 2);
    expect(data.skipped.join()).toContain("是本仓库的 skill 源文");

    // 源文原封不动
    const body = await fs.readFile(path.join(sourceDir, "SKILL.md"), "utf8");
    expect(body).not.toContain("anynote-cli-version");
  });

  it("只被源文挡住时报错，且不提示 --force（那条路加 --force 也没用）", async () => {
    const project = path.join(dir, "project");
    await fs.mkdir(path.join(project, ".git"), { recursive: true });
    const cwd = path.join(project, "apps", "cli");
    await fs.mkdir(cwd, { recursive: true });
    vi.spyOn(process, "cwd").mockReturnValue(cwd);

    const cli = bundledSkills.find((skill) => skill.name === "anynote-cli");
    const sourceDir = path.join(project, ".claude", "skills", "anynote-cli");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, "SKILL.md"), cli?.files["SKILL.md"] ?? "", "utf8");

    const error = await skillInstall
      .run(context(), { agent: ["claude"], local: true, force: true, root: undefined })
      .catch((thrown: Error) => thrown);
    expect(error).toBeInstanceOf(UsageError);
    expect((error as Error).message).toContain("是本仓库的 skill 源文");
    // 源文这条不受 --force 影响，所以不该让用户白跑一趟去加 --force
    expect((error as Error).message).not.toContain("--force");
  });
});

describe("skill list", () => {
  it("未安装时报告未安装与根目录", async () => {
    const output = await skillList.run(context(), { root: undefined });
    const data = output.data as { rows: Array<{ installed: boolean; root: string }> };
    expect(data.rows).toHaveLength(bundledSkills.length * 3);
    expect(data.rows.every((row) => row.installed === false)).toBe(true);
  });

  it("安装后报告版本一致；CLI 升级后报 drifted", async () => {
    await skillInstall.run(context(), { agent: ["all"], force: false, root: undefined });
    const fresh = await skillList.run(context(), { root: undefined });
    expect(
      (fresh.data as { rows: Array<{ drifted: boolean }> }).rows.every((row) => !row.drifted),
    ).toBe(true);

    // 模拟"CLI 升到 0.0.1-test、磁盘上还是 0.0.0-test"
    const base = context();
    const upgraded = { ...base, version: "0.0.1-test" };
    const stale = await skillList.run(upgraded, { root: undefined });
    const rows = (stale.data as { rows: Array<{ drifted: boolean; installedVersion: string }> })
      .rows;
    expect(rows.every((row) => row.drifted)).toBe(true);
    expect(rows[0]?.installedVersion).toBe("0.0.0-test");
  });
});

describe("skill uninstall", () => {
  it("删掉本 CLI 装的目录", async () => {
    await skillInstall.run(context(), { agent: ["all"], force: false, root: undefined });
    const output = await skillUninstall.run(context(), { agent: ["all"], root: undefined });
    const data = output.data as { removed: unknown[]; kept: unknown[] };
    expect(data.removed).toHaveLength(bundledSkills.length * 3);
    expect(data.kept).toHaveLength(0);
    await expect(fs.access(path.join(claudeSkills(), "anynote-cli"))).rejects.toThrow();
  });

  it("保留用户手写的同名 skill 并如实报告", async () => {
    const foreign = path.join(dshSkills(), "anynote-cli");
    await fs.mkdir(foreign, { recursive: true });
    await fs.writeFile(
      path.join(foreign, "SKILL.md"),
      "---\nname: anynote-cli\ndescription: x\n---\n",
      "utf8",
    );
    const output = await skillUninstall.run(context(), { agent: ["dsh"], root: undefined });
    const data = output.data as { removed: unknown[]; kept: Array<{ path: string }> };
    expect(data.removed).toHaveLength(0);
    expect(data.kept.map((entry) => entry.path)).toContain(foreign);
    await expect(fs.access(path.join(foreign, "SKILL.md"))).resolves.toBeUndefined();
  });

  it("没有安装时人类模式给出明确提示", async () => {
    const output = await skillUninstall.run(context(), { agent: ["codex"], root: undefined });
    expect(output.render?.(output.data)).toContain("没有可删除");
  });
});

describe("doctor 汇总 skill 状态", () => {
  it("报告三家的安装数量与漂移", async () => {
    await skillInstall.run(context(), { agent: ["dsh"], force: false, root: undefined });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    const output = await doctor.run(context(), {});
    const data = output.data as {
      skills: Array<{ agent: string; installed: number; total: number; drifted: boolean }>;
      settingsPath: string;
      apiUrlSource: string;
    };
    expect(data.settingsPath).toBe(path.join(dir, "settings.json"));
    expect(data.apiUrlSource).toBe("env");
    const dsh = data.skills.find((row) => row.agent === "dsh");
    expect(dsh).toMatchObject({ installed: bundledSkills.length, total: bundledSkills.length });
    const codex = data.skills.find((row) => row.agent === "codex");
    expect(codex?.installed).toBe(0);
    vi.unstubAllGlobals();
  });
});

describe("config 命令", () => {
  it("config path 给出设置 / 凭据 / 锁三个路径", async () => {
    const output = await configPath.run(context(), {});
    expect(output.data).toMatchObject({
      configDir: dir,
      settingsPath: path.join(dir, "settings.json"),
      credentialsPath: path.join(dir, "credentials.json"),
      lockPath: path.join(dir, ".refresh.lock"),
    });
  });

  it("config set 落盘后 config get 能读回，并标出来源是文件", async () => {
    await configSet.run(context(), { key: "api-url", value: "http://192.168.3.90:8080" });
    const raw = JSON.parse(await fs.readFile(path.join(dir, "settings.json"), "utf8"));
    expect(raw).toMatchObject({ version: 1, apiUrl: "http://192.168.3.90:8080" });

    // 新建 ctx：env 里没有 ANYNOTE_API_URL，于是文件值生效
    const ctx = makeContext({ configDir: dir }).ctx;
    const fresh = {
      ...ctx,
      env: { ...ctx.env, apiUrl: "http://192.168.3.90:8080", apiUrlSource: "file" as const },
    };
    const output = await configGet.run(fresh, {});
    expect(output.data).toMatchObject({
      apiUrl: "http://192.168.3.90:8080",
      apiUrlSource: "file",
      settings: { apiUrl: "http://192.168.3.90:8080" },
    });
  });

  it("config set 去掉末尾斜杠", async () => {
    await configSet.run(context(), { key: "api-url", value: "http://gw.test///" });
    const raw = JSON.parse(await fs.readFile(path.join(dir, "settings.json"), "utf8"));
    expect(raw.apiUrl).toBe("http://gw.test");
  });

  it("config set 拒绝非法 URL 与非 http(s) 协议", async () => {
    await expect(
      configSet.run(context(), { key: "api-url", value: "192.168.3.90:8080" }),
    ).rejects.toThrow(/合法 URL/);
    await expect(
      configSet.run(context(), { key: "api-url", value: "ftp://gw.test" }),
    ).rejects.toThrow(/http/);
    await expect(fs.access(path.join(dir, "settings.json"))).rejects.toThrow();
  });

  it("config set 空串等于恢复默认值", async () => {
    await configSet.run(context(), { key: "api-url", value: "http://gw.test" });
    await configSet.run(context(), { key: "api-url", value: "  " });
    const raw = JSON.parse(await fs.readFile(path.join(dir, "settings.json"), "utf8"));
    expect(raw.apiUrl).toBeUndefined();
  });

  it("config unset 删除设置项且不残留键", async () => {
    await configSet.run(context(), { key: "api-url", value: "http://gw.test" });
    await configUnset.run(context(), { key: "api-url" });
    const raw = JSON.parse(await fs.readFile(path.join(dir, "settings.json"), "utf8"));
    expect(raw.apiUrl).toBeUndefined();
  });
});
