import fs from "node:fs/promises";
import path from "node:path";
import { type BundledSkill, bundledSkills } from "../bundled";
import { UsageError } from "../core/exit";
import {
  type AgentName,
  type SkillRootEnv,
  type SkillScope,
  findInstalledDir,
  resolveSkillRoot,
} from "./agents";
import { readVersion, stamp } from "./stamp";

export type InstallDeps = {
  /** 打进 CLI 的 skill 内容；默认取 `src/bundled.ts` 里的构建期快照 */
  skills?: BundledSkill[];
  version: string;
  env: SkillRootEnv;
  /** 安装范围：全局（默认）或项目级 `--local` */
  scope?: SkillScope;
  /** 仅用于测试注入 rename 失败（Windows 上 rename 会因目录被占用而 EBUSY） */
  rename?: (from: string, to: string) => Promise<void>;
  /** 仅用于测试注入 `.git` 探测，避免起真实目录树 */
  pathExists?: (candidate: string) => boolean;
  now?: () => number;
};

export type InstalledSkill = {
  skill: string;
  agent: AgentName;
  scope: SkillScope;
  root: string;
  /** 安装后的目录（覆盖安装时与旧目录相同） */
  path: string;
  action: "installed" | "updated" | "unchanged";
  /** 覆盖前磁盘上记录的版本；null = 没有版本戳 */
  previousVersion: string | null;
  files: number;
};

/** 解析本次操作的根目录；`pathExists` 让项目根探测在单测里可控。 */
function rootOf(agent: AgentName, deps: InstallDeps): string {
  return resolveSkillRoot(agent, deps.env, deps.scope ?? "global", deps.pathExists);
}

/** skill 包内的相对路径必须落在目标目录里；`..` 或绝对路径一律拒绝。 */
function assertSafeRelative(relative: string): void {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) {
    throw new Error(`skill 包内有非法路径：${relative}`);
  }
}

/**
 * 目标目录的安全检查：**拒绝写到符号链接指向的位置之外**。
 *
 * 只做存在性判断 + 普通目录写入。这里有意识地不跟符号链接：agent 的 skill 目录
 * 常常被用户指向 dotfiles 仓库，而"跟随符号链接"意味着一次误操作就能写到仓库外。
 */
async function assertWritableRoot(root: string): Promise<void> {
  try {
    const stat = await fs.lstat(root);
    if (!stat.isDirectory()) throw new UsageError(`目标路径不是目录：${root}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

/** 原子落盘：先写临时文件再改名。目录级别的 rename 在 Windows 上可能 EBUSY，故按文件写。 */
async function writeFileAtomic(
  file: string,
  content: string,
  rename: (from: string, to: string) => Promise<void>,
): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, content, "utf8");
  await rename(tmp, file);
}

async function readIfExists(file: string): Promise<string | null> {
  return fs.readFile(file, "utf8").catch(() => null);
}

/** 把内容做成带版本戳的副本；SKILL.md 额外插入版本注释。 */
export function stampFiles(skill: BundledSkill, version: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(skill.files).map(([relative, content]) => [
      relative,
      relative === "SKILL.md" ? stamp(content, version) : content,
    ]),
  );
}

/**
 * 目标目录是不是"CLI 自己的 skill 源文"。
 *
 * 在 anynote 仓库里跑 `skill install --local` 时，目标会正好落在
 * `<repo>/.claude/skills/anynote-cli`——那是 `scripts/build-bundled.mjs` 的**输入**，
 * 覆盖它等于把源文改成带版本戳的安装副本，会直接破坏 `bundled.ts` 的一致性门禁。
 *
 * 判据是"没有版本戳，且内容与打包进来的未盖章内容逐字节相同"：只有源文满足这个条件
 * （安装副本一定带戳）。这条**不受 `--force` 影响**——覆盖源文不是用户的合理诉求。
 */
export async function isOwnSource(target: string, skill: BundledSkill): Promise<boolean> {
  const file = path.join(target, "SKILL.md");
  const onDisk = await readIfExists(file);
  if (onDisk === null || readVersion(onDisk) !== null) return false;
  return onDisk === skill.files["SKILL.md"];
}

/**
 * 把**一个** skill 复制到目标根目录。
 *
 * 复制而不是符号链接，是刻意的选择：agent 的全局目录与 CLI 的安装位置没有任何关系
 * （可能是 nvm 里的全局包、可能是仓库里的 dist），软链一旦源文件被清理就变成断链，
 * 而且 Windows 上创建符号链接需要开发者模式或管理员权限。复制则永远可用。
 */
export async function installSkill(
  agent: AgentName,
  skill: BundledSkill,
  deps: InstallDeps,
): Promise<InstalledSkill> {
  const root = rootOf(agent, deps);
  const rename = deps.rename ?? fs.rename;
  await assertWritableRoot(root);

  const files = stampFiles(skill, deps.version);
  const existing = await findInstalledDir(root, skill.name);
  const target = existing ?? path.join(root, skill.name);
  if (await isOwnSource(target, skill)) {
    throw new UsageError(
      `${target} 是本仓库的 skill 源文（bundled.ts 的输入），不能被安装副本覆盖；请改用 anynote skill install（全局），或在别的项目里用 --local`,
    );
  }
  const previous = existing
    ? readVersion((await readIfExists(path.join(existing, "SKILL.md"))) ?? "")
    : null;

  let changed = existing === null;
  for (const [relative, content] of Object.entries(files)) {
    assertSafeRelative(relative);
    const file = path.join(target, relative);
    const before = await readIfExists(file);
    if (before !== content) changed = true;
    await writeFileAtomic(file, content, rename);
  }

  return {
    skill: skill.name,
    agent,
    scope: deps.scope ?? "global",
    root,
    path: target,
    action: existing === null ? "installed" : changed ? "updated" : "unchanged",
    previousVersion: previous,
    files: Object.keys(files).length,
  };
}

export async function installAgent(agent: AgentName, deps: InstallDeps): Promise<InstalledSkill[]> {
  const skills = deps.skills ?? bundledSkills;
  const results: InstalledSkill[] = [];
  for (const skill of skills) results.push(await installSkill(agent, skill, deps));
  return results;
}

export type SkillStatus = {
  skill: string;
  agent: AgentName;
  scope: SkillScope;
  root: string;
  /** 未安装时为 null */
  path: string | null;
  /** 磁盘上记录的版本；null = 没装或没有版本戳 */
  installedVersion: string | null;
  /** 与本次 CLI 的打包版本不一致，需要重跑 install */
  drifted: boolean;
};

/** 只读地比对"磁盘上的 skill"与"打进 CLI 的 skill"，供 `doctor` / `skill list` 用。 */
export async function inspectAgent(agent: AgentName, deps: InstallDeps): Promise<SkillStatus[]> {
  const skills = deps.skills ?? bundledSkills;
  const root = rootOf(agent, deps);
  const results: SkillStatus[] = [];
  for (const skill of skills) {
    const dir = await findInstalledDir(root, skill.name);
    const body = dir ? await readIfExists(path.join(dir, "SKILL.md")) : null;
    const installedVersion = body ? readVersion(body) : null;
    results.push({
      skill: skill.name,
      agent,
      scope: deps.scope ?? "global",
      root,
      path: dir,
      installedVersion,
      drifted: dir !== null && installedVersion !== deps.version,
    });
  }
  return results;
}

/**
 * 卸载：**只删本 CLI 装的那一份**。
 *
 * 判据是 SKILL.md 里有没有版本戳。没有戳说明是用户自己写的同名 skill，
 * 删它等于删用户的东西——这种情况直接跳过并如实返回，而不是"看起来成功了"。
 */
export async function uninstallSkill(
  agent: AgentName,
  skill: BundledSkill,
  deps: InstallDeps,
): Promise<{ skill: string; agent: AgentName; path: string | null; removed: boolean }> {
  const root = rootOf(agent, deps);
  const dir = await findInstalledDir(root, skill.name);
  if (!dir) return { skill: skill.name, agent, path: null, removed: false };
  const body = await readIfExists(path.join(dir, "SKILL.md"));
  if (body === null || readVersion(body) === null) {
    return { skill: skill.name, agent, path: dir, removed: false };
  }
  await fs.rm(dir, { recursive: true, force: true });
  return { skill: skill.name, agent, path: dir, removed: true };
}

export async function uninstallAgent(
  agent: AgentName,
  deps: InstallDeps,
): Promise<Array<{ skill: string; agent: AgentName; path: string | null; removed: boolean }>> {
  const skills = deps.skills ?? bundledSkills;
  const results = [];
  for (const skill of skills) results.push(await uninstallSkill(agent, skill, deps));
  return results;
}
