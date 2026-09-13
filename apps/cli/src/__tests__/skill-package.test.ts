import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BundledSkill } from "../bundled";
import { bundledSkills } from "../bundled";
import { AGENTS, isAgentName, skillRoot, skillRootEnv } from "../skills/agents";
import { stampFiles } from "../skills/install";
import { SKILL_VERSION_PREFIX, readVersion, skillName, stamp } from "../skills/stamp";

const SKILL_BODY = [
  "---",
  "name: anynote-cli",
  "description: 用 anynote CLI 操作 Anynote 的知识库与笔记。",
  "---",
  "",
  "# Anynote CLI",
  "",
  "正文。",
  "",
].join("\n");

describe("stamp", () => {
  it("版本戳插在 frontmatter 之后、正文之前", () => {
    const stamped = stamp(SKILL_BODY, "0.2.0");
    const lines = stamped.split("\n");
    expect(lines.slice(0, 5)).toEqual([
      "---",
      "name: anynote-cli",
      "description: 用 anynote CLI 操作 Anynote 的知识库与笔记。",
      "---",
      `<!-- ${SKILL_VERSION_PREFIX} 0.2.0 -->`,
    ]);
    // frontmatter 必须仍在文件最开头，否则 agent 解析不出 name / description
    expect(stamped.startsWith("---\n")).toBe(true);
    expect(stamped).toContain("# Anynote CLI");
  });

  it("重复 stamp 结果稳定（覆盖安装不会每次都算作变更）", () => {
    const once = stamp(SKILL_BODY, "0.2.0");
    expect(stamp(once, "0.2.0")).toBe(once);
  });

  it("换版本时更新的是同一行，不累积版本注释", () => {
    const upgraded = stamp(stamp(SKILL_BODY, "0.1.0"), "0.2.0");
    expect(upgraded.match(/anynote-cli-version/g)).toHaveLength(1);
    expect(readVersion(upgraded)).toBe("0.2.0");
  });

  it("readVersion 对没戳过的文件返回 null", () => {
    expect(readVersion(SKILL_BODY)).toBeNull();
    expect(readVersion("")).toBeNull();
    expect(readVersion("随便一段话")).toBeNull();
  });

  it("skillName 读 frontmatter 的 name，缺 frontmatter 时为 null", () => {
    expect(skillName(SKILL_BODY)).toBe("anynote-cli");
    expect(skillName("# 没有 frontmatter")).toBeNull();
    expect(skillName("---\ndescription: 只有描述\n---\n")).toBeNull();
  });
});

describe("skillRoot", () => {
  // 路径断言一律走 path.join：Windows 上分隔符是 `\`，硬写 `/` 会假失败
  const at = (...parts: string[]) => path.join(...parts);

  it("Claude Code 落在 ~/.claude/skills", () => {
    expect(skillRoot("claude", { home: at("/home/a") })).toBe(at("/home/a", ".claude", "skills"));
  });

  it("Claude Code 支持 CLAUDE_CONFIG_DIR 整体搬家", () => {
    expect(skillRoot("claude", { home: at("/home/a"), CLAUDE_CONFIG_DIR: at("/opt/claude") })).toBe(
      at("/opt/claude", "skills"),
    );
  });

  it("Codex 用 CODEX_HOME，缺省回落到 ~/.codex", () => {
    expect(skillRoot("codex", { home: at("/home/a") })).toBe(at("/home/a", ".codex", "skills"));
    expect(skillRoot("codex", { home: at("/home/a"), CODEX_HOME: at("/opt/codex") })).toBe(
      at("/opt/codex", "skills"),
    );
  });

  it("dsh 用 DSH_HOME，缺省回落到 ~/.dsh", () => {
    expect(skillRoot("dsh", { home: at("/home/a") })).toBe(at("/home/a", ".dsh", "skills"));
    expect(skillRoot("dsh", { home: at("/home/a"), DSH_HOME: at("/opt/dsh") })).toBe(
      at("/opt/dsh", "skills"),
    );
  });

  it("三个 agent 的根目录互不相同", () => {
    const roots = AGENTS.map((agent) => skillRoot(agent, { home: at("/home/a") }));
    expect(new Set(roots).size).toBe(3);
  });
});

describe("skillRootEnv", () => {
  it("从 process.env 取变量，Windows 用 USERPROFILE", () => {
    const env = skillRootEnv(
      { USERPROFILE: "C:\\Users\\a", APPDATA: "C:\\Users\\a\\AppData\\Roaming", DSH_HOME: "D" },
      "win32",
    );
    expect(env.home).toBe("C:\\Users\\a");
    expect(env.appData).toBe("C:\\Users\\a\\AppData\\Roaming");
    expect(env.DSH_HOME).toBe("D");
  });

  it("非 Windows 用 HOME", () => {
    expect(skillRootEnv({ HOME: "/home/a" }, "linux").home).toBe("/home/a");
  });
});

describe("isAgentName", () => {
  it("只认三个受支持的 agent，all 不是 agent 名", () => {
    expect(isAgentName("claude")).toBe(true);
    expect(isAgentName("codex")).toBe(true);
    expect(isAgentName("dsh")).toBe(true);
    expect(isAgentName("all")).toBe(false);
    expect(isAgentName("cursor")).toBe(false);
  });
});

describe("stampFiles", () => {
  const skill: BundledSkill = {
    name: "anynote-cli",
    files: {
      "SKILL.md": SKILL_BODY,
      "reference/commands.md": "# 命令速查\n",
    },
  };

  it("只给 SKILL.md 盖版本戳，reference 原样保留", () => {
    const files = stampFiles(skill, "0.2.0");
    expect(files["SKILL.md"]).toContain(`${SKILL_VERSION_PREFIX} 0.2.0`);
    expect(files["reference/commands.md"]).toBe("# 命令速查\n");
  });

  it("不修改输入对象（快照是共享的常量）", () => {
    stampFiles(skill, "0.2.0");
    expect(skill.files["SKILL.md"]).toBe(SKILL_BODY);
  });
});

describe("打包进来的 skill 快照", () => {
  const repoSkills = path.resolve(__dirname, "..", "..", "..", "..", ".claude", "skills");

  it("打包了预期数量的 skill，且名字是 kebab-case", () => {
    expect(bundledSkills.length).toBeGreaterThan(0);
    for (const skill of bundledSkills) {
      expect(skill.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(skill.files["SKILL.md"]).toBeDefined();
    }
  });

  it("与 .claude/skills 的源文逐字节一致（改了 skill 但没重新构建会被抓出来）", async () => {
    for (const skill of bundledSkills) {
      const dir = path.join(repoSkills, skill.name);
      const onDisk = (await fs.readFile(path.join(dir, "SKILL.md"), "utf8")).replace(/\r\n/g, "\n");
      expect(skill.files["SKILL.md"]).toBe(onDisk);
    }
  });

  it("reference/commands.md 也一并打包（agent 加载 skill 时要读它）", () => {
    const cli = bundledSkills.find((skill) => skill.name === "anynote-cli");
    expect(Object.keys(cli?.files ?? {})).toContain("reference/commands.md");
  });

  it("skill 里引用的 reference 文件确实存在", () => {
    for (const skill of bundledSkills) {
      const body = skill.files["SKILL.md"] ?? "";
      for (const match of body.matchAll(/@(reference\/[\w.-]+)/g)) {
        expect(Object.keys(skill.files)).toContain(match[1]);
      }
    }
  });
});
