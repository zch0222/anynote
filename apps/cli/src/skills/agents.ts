import fs from "node:fs/promises";
import path from "node:path";
import { skillName } from "./stamp";

/**
 * 支持一键安装 skill 的 agent。
 *
 * | agent | 全局 skill 根目录 | 依据 |
 * |-------|------------------|------|
 * | `claude` | `~/.claude/skills`（可用 `CLAUDE_CONFIG_DIR` 覆盖） | Claude Code 的个人 skill 目录 |
 * | `codex` | `$CODEX_HOME/skills`，默认 `~/.codex/skills` | Codex 的 skill 安装位置 |
 * | `dsh` | `$DSH_HOME/skills`，默认 `~/.dsh/skills` | dsh 的 user 级 skill root |
 *
 * ⚠️ dsh 只扫描 skill 根目录的**直接子项**（`<name>/SKILL.md` 或 `<name>.md`），
 * 不递归，所以不能把一整个 `skills/` 目录塞进某个子目录里。
 */
export const AGENTS = ["claude", "codex", "dsh"] as const;
export type AgentName = (typeof AGENTS)[number];
/** `all` 只在命令行上出现，内部一律展开成 AGENTS 里的具体名字。 */
export type AgentTarget = AgentName | "all";

export function isAgentName(value: string): value is AgentName {
  return (AGENTS as readonly string[]).includes(value);
}

export type SkillRootEnv = {
  home: string;
  /** Windows 用（Claude Code / Codex 在 Windows 上落 APPDATA）；其余平台为 undefined */
  appData?: string | undefined;
  CLAUDE_CONFIG_DIR?: string | undefined;
  CODEX_HOME?: string | undefined;
  DSH_HOME?: string | undefined;
};

/**
 * 从 `process.env` 取出解析根目录需要的变量。
 * 单独抽出来是为了让"环境变量缺失"在单测里可枚举，而不是散落在各分支里。
 */
export function skillRootEnv(env: NodeJS.ProcessEnv, platform: string): SkillRootEnv {
  return {
    home: env.USERPROFILE ?? env.HOME ?? (platform === "win32" ? "" : ""),
    appData: env.APPDATA,
    CLAUDE_CONFIG_DIR: env.CLAUDE_CONFIG_DIR,
    CODEX_HOME: env.CODEX_HOME,
    DSH_HOME: env.DSH_HOME,
  };
}

/** 某个 agent 的全局 skill 根目录。 */
export function skillRoot(agent: AgentName, env: SkillRootEnv): string {
  switch (agent) {
    case "claude":
      // Claude Code 支持 CLAUDE_CONFIG_DIR 整体搬家；给了就以它为准
      return env.CLAUDE_CONFIG_DIR
        ? path.join(env.CLAUDE_CONFIG_DIR, "skills")
        : path.join(env.home, ".claude", "skills");
    case "codex":
      return path.join(env.CODEX_HOME ?? path.join(env.home, ".codex"), "skills");
    case "dsh":
      return path.join(env.DSH_HOME ?? path.join(env.home, ".dsh"), "skills");
  }
}

/**
 * 用 frontmatter 里的 `name` 反查已安装的 skill 目录。
 *
 * 目录名是给人看的，`name` 才是 agent 实际注册的名字；覆盖安装时按 `name` 认领，
 * 才能正确处理"上次装在 `anynote-cli/`、这次用户在别处手改过目录名"这类情况。
 * 同时也避免撞上别人的同名目录：只认本 CLI 装过的（带版本戳）或名字对的。
 */
export async function findInstalledDir(root: string, name: string): Promise<string | null> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const candidates = entries
    .filter((entry) => (entry.isDirectory() || entry.isFile()) && !entry.name.startsWith("."))
    .map((entry) =>
      entry.isDirectory() ? path.join(root, entry.name, "SKILL.md") : path.join(root, entry.name),
    );
  for (const candidate of candidates) {
    const body = await fs.readFile(candidate, "utf8").catch(() => null);
    if (body === null) continue;
    if (skillName(body) === name) return path.dirname(candidate);
  }
  return null;
}
