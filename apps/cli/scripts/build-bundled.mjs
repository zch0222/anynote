#!/usr/bin/env node
/**
 * 把仓库里的 skill 源文打进 `src/bundled.ts`（生成物，入库、CI 卡 diff）。
 *
 * 源是仓库根的 `.claude/skills/anynote-*`——**不另存一份副本**：
 * 同一批 skill 既要给"在仓库里干活的 Claude Code"用（项目级 `.claude/skills`），
 * 也要能一键装到任意目录的 agent（`anynote skill install`）。两份源文必然漂移，
 * 所以这里单向派生：仓库里编辑 → 构建时烘焙进 CLI → 安装时带版本戳复制出去。
 *
 * 为什么是"生成一个 TS 文件"而不是运行时读目录：
 *   1. CLI 的产物是**单文件** `dist/anynote.mjs`，运行时不保证还能看到 skills/（沙箱、拷贝分发）；
 *   2. **版本匹配**是硬要求——skill 与 CLI 的命令/退出码契约强耦合，只有随 CLI 一起构建
 *      才能保证装出去的 skill 版本与当前 CLI 一致；
 *   3. 生成物入库 + CI diff，才能像 `docs/cli/COMMANDS.md` 一样被门禁保护，
 *      不会出现"skill 改了但没重新打包"。
 *
 * 输出必须是输入的**纯函数**：不写时间戳、不写绝对路径，否则 CI 的 diff 门禁永远失败。
 * 行尾统一成 LF 再嵌入：Windows 检出（core.autocrlf）不该让生成物产生差异。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 随 CLI 分发、可一键安装的 skill。加新 skill 时在这里登记（源文放 <repo>/.claude/skills/）。 */
const BUNDLED_SKILL_NAMES = ["anynote-cli", "anynote-notes"];

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const repoRoot = path.resolve(root, "..", "..");
const SKILLS_DIR = path.join(repoRoot, ".claude", "skills");
const OUT = path.join(root, "src", "bundled.ts");

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function skillNameOf(body, label) {
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`${label} 缺少 YAML frontmatter`);
  const name = match[1]
    .match(/^name:\s*(.+)$/m)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");
  if (!name) throw new Error(`${label} 的 frontmatter 缺少 name`);
  if (!KEBAB.test(name)) throw new Error(`skill 名必须是 kebab-case：${name}`);
  return name;
}

/** 递归收集一个 skill 包内的全部文件，路径统一用 `/` 分隔。 */
async function collectFiles(dir, prefix = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = {};
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(files, await collectFiles(full, relative));
    } else if (entry.isFile()) {
      files[relative] = (await fs.readFile(full, "utf8")).replace(/\r\n/g, "\n");
    }
  }
  return files;
}

async function main() {
  const skills = [];
  for (const name of [...BUNDLED_SKILL_NAMES].sort()) {
    const dir = path.join(SKILLS_DIR, name);
    let files;
    try {
      files = await collectFiles(dir);
    } catch {
      throw new Error(`找不到 skill 源目录 ${path.relative(repoRoot, dir)}`);
    }
    if (!files["SKILL.md"]) throw new Error(`${name}/ 缺少 SKILL.md`);
    const declared = skillNameOf(files["SKILL.md"], `${name}/SKILL.md`);
    if (declared !== name) {
      throw new Error(`目录名 ${name} 与 frontmatter 的 name=${declared} 不一致`);
    }
    skills.push({ name, files });
  }
  if (skills.length === 0) throw new Error("没有任何要打包的 skill");

  // 版本号只在 package.json 里写一次，其余两处都是派生物：本脚本抄进 bundled.ts，
  // src/version.ts 只做再导出。这里守住"不许有人再手写一份字面量"，值本身由单测比对。
  const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const versionSource = await fs.readFile(path.join(root, "src", "version.ts"), "utf8");
  if (/CLI_VERSION\s*=\s*"/.test(versionSource)) {
    throw new Error("src/version.ts 又写死了版本号字面量；它应当只是 bundled.ts 的再导出");
  }

  const lines = [
    "// 本文件由 scripts/build-bundled.mjs 生成，不要手改。",
    "// 输入：<repo>/.claude/skills/anynote-* 与 package.json 的 version。",
    "// 改了 skill 源文之后跑 `pnpm --filter @anynote/cli build` 重新生成并提交，CI 会卡 diff。",
    "",
    "export type BundledSkill = {",
    "  /** frontmatter 里的 name，也是安装到 agent 全局目录时的目录名 */",
    "  name: string;",
    "  /** 相对 skill 目录的文件内容，路径用 `/` 分隔 */",
    "  files: Record<string, string>;",
    "};",
    "",
    `export const CLI_VERSION = ${JSON.stringify(pkg.version)};`,
    "",
    "export const bundledSkills: BundledSkill[] = [",
  ];
  for (const skill of skills) {
    lines.push("  {");
    lines.push(`    name: ${JSON.stringify(skill.name)},`);
    lines.push("    files: {");
    for (const [relative, content] of Object.entries(skill.files)) {
      lines.push(`      ${JSON.stringify(relative)}: ${JSON.stringify(content)},`);
    }
    lines.push("    },");
    lines.push("  },");
  }
  lines.push("];");
  lines.push("");

  await fs.writeFile(OUT, lines.join("\n"), "utf8");
  console.info(`已生成 ${path.relative(root, OUT)}：${skills.length} 个 skill（v${pkg.version}）`);
}

await main();
