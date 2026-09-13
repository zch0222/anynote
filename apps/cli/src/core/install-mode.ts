import path from "node:path";

/**
 * CLI 当前是**怎么跑起来的**。
 *
 * - `global`   —— 从全局 node_modules 里跑（`npm install -g <tgz>` 装出来的那份），
 *                 与任何项目目录无关，源仓库删掉也照常工作。
 * - `repo`     —— 从 Anynote 仓库的 `apps/cli/dist/` 直接跑（开发期的 `pnpm build` 产物）。
 *                 这也是相对路径 `node apps/cli/dist/anynote.mjs` 那种用法。
 * - `unknown`  —— 其它位置（例如手动拷到某处的单文件）。
 *
 * 之所以要把它报出来：`node apps/cli/dist/anynote.mjs` 与全局 `anynote` 的行为**看起来一样**，
 * 但前者依赖当前目录、换台机器或删掉仓库就失效。doctor 把它标出来，用户一眼能看出
 * 自己是不是装的"独立副本"。
 */
export type InstallMode = "global" | "repo" | "unknown";

const posix = (value: string) => value.split(path.sep).join("/");

export function detectInstallMode(execPath: string): InstallMode {
  const normalized = posix(path.resolve(execPath));
  // 全局包：<prefix>/node_modules/@anynote/cli/anynote.mjs
  // scoped 与 unscoped 两种都认，避免将来改包名后静默变成 unknown
  if (/\/node_modules\/(@anynote\/cli|anynote-cli)\//.test(normalized)) return "global";
  // 仓库内构建产物：<repo>/apps/cli/dist/anynote.mjs
  if (/\/apps\/cli\/dist\//.test(normalized)) return "repo";
  return "unknown";
}

/** 该模式是否与"当前项目目录"解耦。 */
export function isSelfContained(mode: InstallMode): boolean {
  return mode !== "repo";
}
