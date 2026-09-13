#!/usr/bin/env node
/**
 * 把 CLI 打成可全局安装的 npm 包（`dist/anynote-cli-<version>.tgz`）。
 *
 * 目的：让 `npm install -g <tgz>` **真正复制**一份到全局目录之后，CLI 就与仓库、
 * `node_modules`、当前工作目录彻底无关——效果等同于 `npm install -g` 一个已发布的包。
 *
 * ⚠️ 为什么不直接 `npm install -g <仓库里的 apps/cli 目录>`：
 * npm 对"本地目录"参数会建 **junction / symlink** 指回源目录（实测 Windows 上是
 * Junction、Target 指向源路径），源目录一删就断链——那正是"依赖项目目录"的老问题。
 * `npm pack` 出的 tarball 走的是"解包复制"，实测全局包是普通目录，删掉源目录后照常运行。
 *
 * 包内容只放两样东西：`package.json` + 已构建好的单文件 `dist/anynote.mjs`
 * （tsup 已把 commander / zod / openapi-fetch / api-core 与全部 skill 内联进去）。
 * 因此 tarball 不带 node_modules、不需要安装依赖，`npm install -g` 也不联网。
 *
 * 生成物落在 dist/（已 gitignore），不入库。
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dist = path.join(root, "dist");
const entry = path.join(dist, "anynote.mjs");

async function main() {
  const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));

  try {
    await fs.access(entry);
  } catch {
    throw new Error("找不到 dist/anynote.mjs，先执行 pnpm --filter @anynote/cli build");
  }

  // 打包用的"发布骨架"：只含 bin 指向的单文件，没有任何 dependencies。
  // 字段与仓库内 package.json 保持同名同版本，便于用 `npm ls -g` 对账。
  const manifest = {
    name: pkg.name,
    version: pkg.version,
    description: "Anynote 命令行前端：供人与 agent 操作知识库与笔记",
    type: "module",
    bin: { anynote: "./anynote.mjs" },
    engines: pkg.engines,
    license: "UNLICENSED",
    private: false,
  };

  const stage = path.join(dist, "pack");
  await fs.rm(stage, { recursive: true, force: true });
  await fs.mkdir(stage, { recursive: true });
  await fs.writeFile(
    path.join(stage, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await fs.copyFile(entry, path.join(stage, "anynote.mjs"));

  // 用 npm pack 打印的文件名反推产物路径，而不是自己拼：
  // scoped 包的命名规则（@anynote/cli → anynote-cli-0.1.0.tgz）随 npm 版本变过，
  // 直接读它的输出最稳。
  const { stdout } = await execFileAsync("npm", ["pack", "--pack-destination", dist], {
    cwd: stage,
    shell: true,
  });
  const packed = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
  if (!packed) throw new Error(`npm pack 没有输出文件名：${stdout}`);
  const tgz = path.resolve(dist, packed.trim());

  // 校验产物确实存在且非空，避免"脚本说成功但没东西"
  const stat = await fs.stat(tgz);
  if (stat.size === 0) throw new Error(`${tgz} 是空文件`);
  await fs.rm(stage, { recursive: true, force: true });

  console.info(`已生成 ${path.relative(root, tgz)}（${Math.round(stat.size / 1024)} KB）`);
  console.info(`全局安装： npm install -g "${tgz}"`);
}

await main();
