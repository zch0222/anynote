import { z } from "zod";
import { bundledSkills } from "../bundled";
import { defineCommand, result } from "../core/command";
import type { CliContext } from "../core/context";
import { UsageError } from "../core/exit";
import {
  AGENTS,
  type AgentName,
  type AgentTarget,
  skillRoot,
  skillRootEnv,
} from "../skills/agents";
import {
  type InstallDeps,
  type InstalledSkill,
  inspectAgent,
  installAgent,
  uninstallAgent,
} from "../skills/install";

export const AGENT_VALUES = [...AGENTS, "all"] as const;

/**
 * `--agent` 可重复给，也可给 `all`；两者混给时取并集。
 * 顺序固定成 AGENTS 的顺序，保证输出稳定、测试可断言。
 */
export function resolveTargets(values: AgentTarget[]): AgentName[] {
  const wanted = new Set<AgentName>();
  for (const value of values.length > 0 ? values : (["all"] as AgentTarget[])) {
    if (value === "all") for (const agent of AGENTS) wanted.add(agent);
    else wanted.add(value);
  }
  return AGENTS.filter((agent) => wanted.has(agent));
}

/** `--root` 只重定向 Claude Code：它的配置根目录可以用一个环境变量整体搬家。 */
export function installDeps(
  version: string,
  options: { root?: string | undefined; env?: NodeJS.ProcessEnv; platform?: string } = {},
): InstallDeps {
  const env = skillRootEnv(options.env ?? process.env, options.platform ?? process.platform);
  return { version, env: options.root ? { ...env, CLAUDE_CONFIG_DIR: options.root } : env };
}

function renderInstalled(installed: InstalledSkill[], version: string): string[] {
  return installed.map((entry) => {
    const previous =
      entry.previousVersion && entry.previousVersion !== version
        ? `（原 v${entry.previousVersion}）`
        : "";
    return `  ${entry.agent.padEnd(6)} ${entry.action.padEnd(9)} ${entry.path}${previous}`;
  });
}

export const skillInstall = defineCommand({
  name: "skill install",
  summary: "把 CLI 自带的 skill 一键安装到各 agent 的全局目录",
  description:
    "支持 Claude Code（~/.claude/skills，可用 CLAUDE_CONFIG_DIR 覆盖）、Codex（$CODEX_HOME/skills，默认 ~/.codex/skills）、" +
    "dsh（$DSH_HOME/skills，默认 ~/.dsh/skills）。**复制而非符号链接**；skill 内容随 CLI 一起打包，" +
    "所以装出来的版本与当前 CLI 一定匹配，CLI 升级后重跑一次即完成升级。可重复执行，内容没变时是幂等的。",
  mutating: true,
  confirm: false,
  args: z.object({
    agent: z
      .array(z.enum(AGENT_VALUES))
      .default(["all"])
      .describe("目标 agent，可重复给；all = 三个都装"),
    force: z.boolean().default(false).describe("目标位置已有同名但不是本 CLI 装的 skill 时也覆盖"),
    root: z.string().min(1).optional().describe("临时覆盖 Claude Code 的配置根目录"),
  }),
  examples: [
    { cmd: "anynote skill install", note: "装到 Claude Code / Codex / dsh 三家的全局目录" },
    { cmd: "anynote skill install --agent=claude --agent=dsh" },
    { cmd: "anynote skill list", note: "查看各家的安装状态与版本漂移" },
  ],
  run: async (ctx, args) => {
    const agents = resolveTargets(args.agent as AgentTarget[]);
    const deps = installDeps(ctx.version, args);
    const installed: InstalledSkill[] = [];
    const skipped: string[] = [];

    for (const agent of agents) {
      const existing = await inspectAgent(agent, deps);
      // 没有版本戳 = 不是本 CLI 装的（用户自己写的同名 skill）。覆盖它等于删用户的东西，
      // 必须显式 --force 才动手；这里先整体跳过该 agent，避免装一半。
      const foreign = existing.filter(
        (status) => status.path !== null && status.installedVersion === null,
      );
      if (foreign.length > 0 && !args.force) {
        for (const status of foreign) {
          skipped.push(`${status.skill} 已存在于 ${status.path}，但不是 anynote CLI 安装的`);
        }
        continue;
      }
      installed.push(...(await installAgent(agent, deps)));
    }

    if (installed.length === 0 && skipped.length > 0) {
      throw new UsageError(`没有安装任何 skill：${skipped.join("；")}。确认要覆盖请加 --force`);
    }

    return result(
      {
        version: ctx.version,
        skills: bundledSkills.map((skill) => skill.name),
        installed,
        skipped,
      },
      {
        render: (data) =>
          [
            `已用 v${data.version} 安装 ${data.skills.join("、")}`,
            ...renderInstalled(data.installed, data.version),
            ...data.skipped.map((line) => `  跳过：${line}`),
            "重启 agent 会话后生效。",
          ].join("\n"),
      },
    );
  },
});

export const skillList = defineCommand({
  name: "skill list",
  summary: "列出各 agent 全局目录里的 anynote skill 与版本匹配情况",
  description:
    "只读检查每个 skill 是否已安装、磁盘上记录的版本，以及是否与当前 CLI 打包的版本不一致" +
    "（drifted=true 表示需要重跑 anynote skill install）。",
  args: z.object({
    root: z.string().min(1).optional().describe("临时覆盖 Claude Code 的配置根目录"),
  }),
  examples: [{ cmd: "anynote skill list" }],
  run: async (ctx, args) => {
    const deps = installDeps(ctx.version, args);
    const rows = [];
    for (const agent of AGENTS) {
      for (const status of await inspectAgent(agent, deps)) {
        rows.push({
          skill: status.skill,
          agent: status.agent,
          root: status.root,
          installed: status.path !== null,
          installedVersion: status.installedVersion,
          cliVersion: ctx.version,
          drifted: status.drifted,
          path: status.path,
        });
      }
    }
    return result(
      { cliVersion: ctx.version, rows },
      {
        render: (data) =>
          data.rows
            .map((row) => {
              const state = row.installed
                ? `${row.installedVersion ? `v${row.installedVersion}` : "无版本戳（非本 CLI 安装）"}` +
                  `${row.drifted ? ` → 需重装为 v${row.cliVersion}` : ""}  ${row.path}`
                : `未安装  ${row.root}`;
              return `${row.skill.padEnd(16)} ${row.agent.padEnd(6)} ${state}`;
            })
            .join("\n"),
      },
    );
  },
});

export const skillUninstall = defineCommand({
  name: "skill uninstall",
  summary: "从各 agent 全局目录移除本 CLI 安装的 skill",
  description:
    "只删带 anynote CLI 版本戳的目录；同名但不是本 CLI 安装的（用户手写）一律保留并如实报告，" +
    "不会误删用户自己的 skill。",
  mutating: true,
  args: z.object({
    agent: z
      .array(z.enum(AGENT_VALUES))
      .default(["all"])
      .describe("目标 agent，可重复给；all = 三个都检查"),
    root: z.string().min(1).optional().describe("临时覆盖 Claude Code 的配置根目录"),
  }),
  examples: [{ cmd: "anynote skill uninstall --agent=claude" }],
  run: async (ctx, args) => {
    const agents = resolveTargets(args.agent as AgentTarget[]);
    const deps = installDeps(ctx.version, args);
    const removed: Array<{ agent: AgentName; skill: string; path: string | null }> = [];
    const kept: Array<{ agent: AgentName; skill: string; path: string | null }> = [];
    for (const agent of agents) {
      for (const entry of await uninstallAgent(agent, deps)) {
        if (entry.removed) removed.push({ agent, skill: entry.skill, path: entry.path });
        else if (entry.path) kept.push({ agent, skill: entry.skill, path: entry.path });
      }
    }
    return result(
      { removed, kept },
      {
        render: (data) =>
          [
            ...data.removed.map((entry) => `已删除 ${entry.agent} ${entry.path}`),
            ...data.kept.map(
              (entry) => `保留 ${entry.agent} ${entry.path}（不是 anynote CLI 安装的）`,
            ),
          ].join("\n") || "没有可删除的 anynote skill 安装。",
      },
    );
  },
});

/**
 * 供 `doctor` 复用：一眼看出"每个 agent 装没装、版本对不对"，
 * 省掉"先 doctor 再 skill list"两步。只读，不碰文件系统以外的东西。
 */
export async function summarizeSkillStatus(ctx: CliContext) {
  const deps = installDeps(ctx.version);
  const rows = [];
  for (const agent of AGENTS) {
    const statuses = await inspectAgent(agent, deps);
    rows.push({
      agent,
      root: skillRoot(agent, deps.env),
      installed: statuses.filter((status) => status.path !== null).length,
      total: statuses.length,
      drifted: statuses.some((status) => status.drifted),
    });
  }
  return rows;
}
