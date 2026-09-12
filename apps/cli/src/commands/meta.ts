import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { defineCommand, result } from "../core/command";
import { ExitCode, UsageError } from "../core/exit";
import { buildManifest } from "../manifest/json";
import { renderManifestMarkdown } from "../manifest/markdown";

/** 生成物落点，相对仓库根。新增落点要同步 CI 的 drift 检查。 */
export const MANIFEST_TARGETS = [
  "docs/cli/COMMANDS.md",
  ".claude/skills/anynote-cli/reference/commands.md",
];

export const manifest = defineCommand({
  name: "manifest",
  summary: "输出命令清单（agent 自描述 / 文档生成）",
  description:
    "把命令注册表导出成 JSON 或 Markdown。输出中不含时间戳与绝对路径，是输入的纯函数，" +
    "因此可以入库并用 git diff 卡漂移。",
  args: z.object({
    format: z.enum(["json", "markdown"]).default("json").describe("输出格式"),
    write: z.boolean().default(false).describe("写入仓库内的生成物落点（仅 markdown）"),
    root: z.string().min(1).optional().describe("仓库根目录，默认由可执行文件位置推导"),
  }),
  examples: [
    { cmd: "anynote manifest --format=json" },
    { cmd: "anynote manifest --format=markdown --write", note: "CI 用：写盘后 git diff 必须为空" },
  ],
  run: async (ctx, args) => {
    const data = buildManifest(ctx.commands, ctx.version, { ...ExitCode });
    if (args.format === "json") {
      if (args.write) throw new UsageError("--write 只支持 --format=markdown");
      return result(data, { render: () => JSON.stringify(data, null, 2) });
    }

    const markdown = renderManifestMarkdown(data);
    if (!args.write) return result({ markdown }, { render: () => markdown });

    const root = path.resolve(args.root ?? resolveRepoRoot());
    const written: string[] = [];
    for (const target of MANIFEST_TARGETS) {
      const file = path.resolve(root, target);
      // 生成物只允许落在仓库内，避免 --root 写飞
      if (!file.startsWith(`${root}${path.sep}`)) {
        throw new UsageError(`生成物落点越出仓库根：${target}`);
      }
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, markdown, "utf8");
      written.push(target);
    }
    return result({ written }, { render: (value) => `已写入：\n${value.written.join("\n")}` });
  },
});

/** dist/anynote.mjs 位于 <repo>/apps/cli/dist，向上三层就是仓库根。 */
export function resolveRepoRoot(moduleUrl: string = import.meta.url): string {
  const here = path.dirname(new URL(moduleUrl).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  return path.resolve(here, "..", "..", "..");
}

export const doctor = defineCommand({
  name: "doctor",
  summary: "自检：网关可达性与本地凭据状态",
  description: "网关不可达时退出码 4；凭据缺失或失效时退出码 3。不会打印 token 本身。",
  args: z.object({}),
  run: async (ctx) => {
    const health = await fetch(`${ctx.env.apiUrl}/actuator/health`, {
      signal: AbortSignal.timeout(5_000),
    })
      .then((response) => (response.ok ? "UP" : `HTTP ${response.status}`))
      .catch((error: Error) => `unreachable: ${error.message}`);
    const profile = await ctx.credentials.readProfile();
    return result({
      version: ctx.version,
      apiUrl: ctx.env.apiUrl,
      gateway: health,
      profile: ctx.credentials.profileName,
      credentialsPath: ctx.credentials.filePath,
      authenticated: ctx.credentials.usesEnvToken || Boolean(profile?.accessToken),
      commands: ctx.commands.length,
    });
  },
});

export const configPath = defineCommand({
  name: "config path",
  summary: "打印配置与凭据文件路径",
  args: z.object({}),
  run: async (ctx) =>
    result({
      configDir: ctx.env.configDir,
      credentialsPath: ctx.credentials.filePath,
      lockPath: ctx.credentials.lockPath,
    }),
});
