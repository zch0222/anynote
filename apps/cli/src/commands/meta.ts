import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { defineCommand, result } from "../core/command";
import { DEFAULT_API_URL, trimTrailingSlashes } from "../core/env";
import { ExitCode, UsageError } from "../core/exit";
import { buildManifest } from "../manifest/json";
import { renderManifestMarkdown } from "../manifest/markdown";
import { summarizeSkillStatus } from "./skill";

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
  summary: "自检：网关可达性、本地凭据与 skill 安装状态",
  description:
    "网关不可达时退出码 4；凭据缺失或失效时退出码 3。不会打印 token 本身。" +
    "同时报告三家 agent 全局目录里 skill 的安装与版本匹配情况。",
  args: z.object({}),
  run: async (ctx) => {
    const health = await fetch(`${ctx.env.apiUrl}/actuator/health`, {
      signal: AbortSignal.timeout(5_000),
    })
      .then((response) => (response.ok ? "UP" : `HTTP ${response.status}`))
      .catch((error: Error) => `unreachable: ${error.message}`);
    const profile = await ctx.credentials.readProfile();
    const skills = await summarizeSkillStatus(ctx);
    return result({
      version: ctx.version,
      apiUrl: ctx.env.apiUrl,
      apiUrlSource: ctx.env.apiUrlSource,
      gateway: health,
      profile: ctx.credentials.profileName,
      credentialsPath: ctx.credentials.filePath,
      settingsPath: ctx.settings.filePath,
      authenticated: ctx.credentials.usesEnvToken || Boolean(profile?.accessToken),
      skills,
      commands: ctx.commands.length,
    });
  },
});

export const configPath = defineCommand({
  name: "config path",
  summary: "打印配置、设置与凭据文件路径",
  args: z.object({}),
  run: async (ctx) =>
    result({
      configDir: ctx.env.configDir,
      settingsPath: ctx.settings.filePath,
      credentialsPath: ctx.credentials.filePath,
      lockPath: ctx.credentials.lockPath,
      apiUrl: ctx.env.apiUrl,
      apiUrlSource: ctx.env.apiUrlSource,
    }),
});

export const configGet = defineCommand({
  name: "config get",
  summary: "查看持久化设置与环境变量的生效结果",
  description:
    "打印设置文件内容，以及 apiUrl 的**生效值与其来源**（env / file / default）。" +
    "凭据不在这个文件里，见 config path 给出的 credentials.json。",
  args: z.object({}),
  run: async (ctx) => {
    const settings = await ctx.settings.read();
    return result({
      settingsPath: ctx.settings.filePath,
      settings,
      apiUrl: ctx.env.apiUrl,
      apiUrlSource: ctx.env.apiUrlSource,
      defaultApiUrl: DEFAULT_API_URL,
      profile: ctx.env.profile,
      configDir: ctx.env.configDir,
    });
  },
});

export const configSet = defineCommand({
  name: "config set",
  summary: "把网关地址等设置持久化到 settings.json",
  description:
    "支持 api-url。写进 `<configDir>/settings.json`，之后所有命令都会用它，无需再设环境变量；" +
    "优先级仍是 `--api-url` / `ANYNOTE_API_URL` 更高。传空串等于恢复默认值。",
  mutating: true,
  confirm: false,
  args: z.object({
    key: z.enum(["api-url"]).describe("设置项，当前只有 api-url"),
    value: z.string().describe(`设置值；api-url 需要是合法 URL，传空串恢复默认 ${DEFAULT_API_URL}`),
  }),
  positional: ["key", "value"],
  examples: [
    { cmd: "anynote config set api-url http://192.168.3.90:8080" },
    { cmd: "anynote config set api-url ''", note: "恢复默认网关地址" },
  ],
  run: async (ctx, args) => {
    const raw = args.value.trim();
    if (raw === "") {
      await ctx.settings.write({});
      return result(
        {
          key: args.key,
          value: null,
          apiUrl: DEFAULT_API_URL,
          settingsPath: ctx.settings.filePath,
        },
        { render: () => `已清除 ${args.key}，恢复默认 ${DEFAULT_API_URL}` },
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new UsageError(`${args.key} 需要是合法 URL（含协议），收到：${raw}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new UsageError(`${args.key} 只支持 http / https，收到：${parsed.protocol}`);
    }
    const value = trimTrailingSlashes(raw);
    // 先读后写：将来加第二项设置时不会把别的键抹掉
    const current = await ctx.settings.read();
    await ctx.settings.write({ ...current, apiUrl: value });
    return result(
      { key: args.key, value, apiUrl: value, settingsPath: ctx.settings.filePath },
      { render: (data) => `已写入 ${data.settingsPath}：${data.key} = ${data.value}` },
    );
  },
});

export const configUnset = defineCommand({
  name: "config unset",
  summary: "删除持久化设置项，恢复内置默认值",
  mutating: true,
  confirm: false,
  args: z.object({ key: z.enum(["api-url"]).describe("设置项，当前只有 api-url") }),
  positional: ["key"],
  examples: [{ cmd: "anynote config unset api-url" }],
  run: async (ctx, args) => {
    // 这里是"清掉 api-url"而不是"改 api-url"，所以显式构造剩余项：
    // exactOptionalPropertyTypes 下不能给可选字段赋 undefined，delete 运算符又被
    // biome 的 noDelete 规则拦着，解构丢弃是两边都满足的写法。
    const { apiUrl: _dropped, ...rest } = await ctx.settings.read();
    await ctx.settings.write(rest);
    return result(
      { key: args.key, cleared: true, apiUrl: DEFAULT_API_URL },
      { render: () => `已删除 ${args.key}，恢复默认 ${DEFAULT_API_URL}` },
    );
  },
});
