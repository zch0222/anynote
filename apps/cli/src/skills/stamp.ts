/**
 * skill 的版本戳。
 *
 * 安装到 agent 的全局目录后，skill 就脱离了 CLI 的版本管理：如果只在安装时复制文件，
 * 用户升级 CLI 后 `~/.claude/skills/anynote-*` 会永远停在旧版本，而 CLI 与 skill 的
 * 命令/退出码契约是**强耦合**的（skill 写错退出码，agent 就会做错决策）。
 *
 * 所以每次安装都在 SKILL.md 的 frontmatter 之后插一行注释，记录产出它的 CLI 版本；
 * `doctor` 与 `skill list` 据此报出漂移，`skill install` 每次覆盖式重写。
 *
 * 这一行同时充当"这是 anynote CLI 安装的"标记：卸载只删带标记的目录，绝不误删用户
 * 手写的同名 skill。
 */
export const SKILL_VERSION_PREFIX = "anynote-cli-version:";

export function stampBody(body: string, version: string): string {
  return `${body.trimEnd()}\n\n<!-- ${SKILL_VERSION_PREFIX} ${version} -->\n`;
}

function frontmatterEnd(body: string): number {
  if (!body.startsWith("---")) return 0;
  const lines = body.split("\n");
  if (lines[0]?.trim() !== "---") return 0;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === "---") {
      // 返回的是"frontmatter 结束行之后的偏移"，含它自己的换行
      return lines.slice(0, index + 1).join("\n").length + 1;
    }
  }
  return 0;
}

/** 已安装文件里记录的 CLI 版本；未安装或不是本 CLI 装的返回 null。 */
export function readVersion(body: string): string | null {
  const match = body.match(new RegExp(`<!--\\s*${SKILL_VERSION_PREFIX}\\s*([^\\s>]+)\\s*-->`));
  return match?.[1] ?? null;
}

/**
 * 把版本戳插到 frontmatter 之后、正文之前，并且**先移除已有的戳**。
 *
 * 位置是有讲究的：frontmatter 必须留在文件最开头，否则 agent 解析不出 name / description；
 * 而放在正文中间又会打乱 skill 自己的小节结构。
 *
 * 幂等性是硬要求：重复安装必须得到逐字节相同的文件，否则 `skill install` 每次都会
 * 报 updated、CI 的 diff 门禁也会抖。所以这里是"替换"而不是"插入"。
 */
export function stamp(body: string, version: string): string {
  const cleaned = body.replace(
    new RegExp(`^<!--\\s*${SKILL_VERSION_PREFIX}\\s*[^>]*-->\\n?`, "m"),
    "",
  );
  const at = frontmatterEnd(cleaned);
  const head = cleaned.slice(0, at);
  const rest = cleaned.slice(at).replace(/^\n+/, "");
  return `${head}<!-- ${SKILL_VERSION_PREFIX} ${version} -->\n\n${rest.trimEnd()}\n`;
}

/**
 * frontmatter 里的 `name`。
 *
 * 不引入 YAML 依赖：skill 的 frontmatter 只有 name / description 两个扁平字段，
 * 而这里要判断的是**目标 skill 是不是本 CLI 装的**，读不到 name 就当不是。
 */
export function skillName(body: string): string | null {
  const at = frontmatterEnd(body);
  if (at === 0) return null;
  const match = body.slice(0, at).match(/^name:\s*(.+)$/m);
  return match?.[1]?.trim().replace(/^["']|["']$/g, "") ?? null;
}
