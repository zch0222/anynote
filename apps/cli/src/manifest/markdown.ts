import type { Manifest, ManifestCommand } from "./json";

const STATUS_LABEL: Record<string, string> = {
  stable: "稳定",
  experimental: "实验",
  blocked: "后端阻塞",
};

type ArgRow = { name: string; type: string; required: boolean; default: string; note: string };

function jsonSchemaRows(command: ManifestCommand): ArgRow[] {
  const schema = command.args as {
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  return Object.entries(properties).map(([name, spec]) => {
    const enumValues = Array.isArray(spec.enum) ? (spec.enum as unknown[]) : undefined;
    return {
      name,
      type: enumValues ? enumValues.map(String).join(" | ") : String(spec.type ?? "string"),
      required: required.has(name),
      default: spec.default === undefined ? "" : JSON.stringify(spec.default),
      note: typeof spec.description === "string" ? spec.description : "",
    };
  });
}

/** 参数在命令行上的写法：位置参数直接写名字，其余是 --kebab-case。 */
export function optionFlag(name: string): string {
  return `--${name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`;
}

function renderCommand(command: ManifestCommand): string[] {
  const lines: string[] = [];
  const badges = [STATUS_LABEL[command.status] ?? command.status];
  if (command.mutating) badges.push("写操作");
  lines.push(`### \`anynote ${command.name}\``);
  lines.push("");
  lines.push(`${command.summary}（${badges.join(" · ")}）`);
  lines.push("");
  if (command.description) {
    lines.push(command.description);
    lines.push("");
  }
  if (command.endpoint) {
    lines.push(`后端端点：\`${command.endpoint}\``);
    lines.push("");
  }
  const rows = jsonSchemaRows(command);
  if (rows.length > 0) {
    lines.push("| 参数 | 类型 | 必填 | 默认 | 说明 |");
    lines.push("|------|------|------|------|------|");
    for (const row of rows) {
      const positional = command.positional.includes(row.name);
      const label = positional ? `\`<${row.name}>\`` : `\`${optionFlag(row.name)}\``;
      lines.push(
        `| ${label} | ${row.type} | ${row.required ? "是" : "否"} | ${row.default || "-"} | ${row.note || "-"} |`,
      );
    }
    lines.push("");
  }
  if (command.examples.length > 0) {
    lines.push("```bash");
    for (const example of command.examples) {
      if (example.note) lines.push(`# ${example.note}`);
      lines.push(example.cmd);
    }
    lines.push("```");
    lines.push("");
  }
  return lines;
}

/**
 * manifest → Markdown 速查表。生成物，供 docs/cli/COMMANDS.md 与 skills 的 reference 共用。
 * 与 buildManifest 一样必须是纯函数。
 */
export function renderManifestMarkdown(manifest: Manifest): string {
  const lines: string[] = [];
  lines.push("# Anynote CLI 命令速查");
  lines.push("");
  lines.push(
    "> **本文件由 `anynote manifest --format=markdown --write` 生成，不要手改。**" +
      "改命令定义后重新生成并提交，CI 会对生成物做 diff 校验。",
  );
  lines.push("");
  lines.push("## 全局约定");
  lines.push("");
  lines.push("- `--json`：输出 JSON 信封；**stdout 不是 TTY 时自动开启**，agent 无需显式指定。");
  lines.push('  - 成功：`{ "ok": true, "command": "...", "data": ... }`');
  lines.push(
    '  - 失败：`{ "ok": false, "command": "...", "error": { "code", "message", "exitCode" } }`',
  );
  lines.push("- `--fields a,b`：裁剪输出字段，控制 agent 上下文预算。");
  lines.push("- 写操作在非 TTY 环境必须显式 `--yes`，否则以退出码 2 拒绝且不发请求。");
  lines.push("- `--dry-run`：只打印将要执行的写操作，不实际发送。");
  lines.push("- `--profile <name>` / `ANYNOTE_PROFILE`：切换凭据 profile。");
  lines.push(
    "- `ANYNOTE_API_URL` 指定网关地址；`ANYNOTE_TOKEN` 可直接提供 token（不落盘、不刷新）。",
  );
  lines.push("");
  lines.push("## 退出码");
  lines.push("");
  lines.push("| 码 | 名称 | 含义 |");
  lines.push("|----|------|------|");
  const meanings: Record<string, string> = {
    OK: "成功",
    BUSINESS: "业务失败（后端 code 非 00000）",
    USAGE: "参数 / 用法错误，写操作缺 --yes 也归此类",
    AUTH: "未认证或凭据失效，需要重新 auth login",
    NETWORK: "网关不可达 / 超时",
    CONFLICT: "乐观并发冲突，重读后合并再重试",
    NOT_FOUND: "资源不存在",
  };
  for (const [name, code] of Object.entries(manifest.exitCodes)) {
    lines.push(`| ${code} | ${name} | ${meanings[name] ?? ""} |`);
  }
  lines.push("");
  lines.push("## 命令");
  lines.push("");
  for (const command of manifest.commands) lines.push(...renderCommand(command));
  return `${lines.join("\n").trimEnd()}\n`;
}
