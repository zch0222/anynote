import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BundledSkill } from "../bundled";
import { skillRoot, skillRootEnv } from "../skills/agents";
import { type InstallDeps, inspectAgent, installAgent, uninstallAgent } from "../skills/install";
import { readVersion } from "../skills/stamp";

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

const SECOND_BODY = SKILL_BODY.replaceAll("anynote-cli", "anynote-notes").replace(
  "# Anynote CLI",
  "# Anynote 笔记配方",
);

const skills: BundledSkill[] = [
  { name: "anynote-cli", files: { "SKILL.md": SKILL_BODY, "reference/commands.md": "# 速查\n" } },
  { name: "anynote-notes", files: { "SKILL.md": SECOND_BODY } },
];

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "anynote-skill-"));
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

function deps(version = "0.2.0"): InstallDeps {
  return { skills, version, env: skillRootEnv({ HOME: home, USERPROFILE: home }, "linux") };
}

const claudeRoot = () => skillRoot("claude", deps().env);

describe("installAgent", () => {
  it("把两个 skill 复制到全局根目录，路径是 <root>/<name>/SKILL.md", async () => {
    const installed = await installAgent("claude", deps());
    expect(installed.map((entry) => entry.action)).toEqual(["installed", "installed"]);
    expect(installed[0]?.path).toBe(path.join(claudeRoot(), "anynote-cli"));
    const body = await fs.readFile(path.join(claudeRoot(), "anynote-cli", "SKILL.md"), "utf8");
    expect(body).toContain("# Anynote CLI");
    expect(readVersion(body)).toBe("0.2.0");
  });

  it("子目录文件一并复制（reference/commands.md）", async () => {
    await installAgent("claude", deps());
    await expect(
      fs.readFile(path.join(claudeRoot(), "anynote-cli", "reference", "commands.md"), "utf8"),
    ).resolves.toBe("# 速查\n");
  });

  it("复制而非符号链接：源目录删掉后安装副本仍可读", async () => {
    // 这是"复制模式"的核心保证——CLI 可能装在 nvm 的全局包里，软链会变断链
    await installAgent("claude", deps());
    const stat = await fs.lstat(path.join(claudeRoot(), "anynote-cli", "SKILL.md"));
    expect(stat.isSymbolicLink()).toBe(false);
    expect(stat.isFile()).toBe(true);
  });

  it("重复安装是幂等的：action=unchanged", async () => {
    await installAgent("claude", deps());
    const again = await installAgent("claude", deps());
    expect(again.map((entry) => entry.action)).toEqual(["unchanged", "unchanged"]);
  });

  it("版本变化时报 updated 并记下原版本，实现升级", async () => {
    await installAgent("claude", deps("0.1.0"));
    const upgraded = await installAgent("claude", deps("0.2.0"));
    expect(upgraded.map((entry) => entry.action)).toEqual(["updated", "updated"]);
    expect(upgraded[0]?.previousVersion).toBe("0.1.0");
    const body = await fs.readFile(path.join(claudeRoot(), "anynote-cli", "SKILL.md"), "utf8");
    expect(readVersion(body)).toBe("0.2.0");
  });

  it("源内容变了（同版本）也报 updated，不会静默留旧内容", async () => {
    await installAgent("claude", deps());
    const changed: InstallDeps = {
      ...deps(),
      skills: [
        { name: "anynote-cli", files: { "SKILL.md": SKILL_BODY.replace("正文。", "新正文。") } },
      ],
    };
    const result = await installAgent("claude", changed);
    expect(result[0]?.action).toBe("updated");
  });

  it("三个 agent 各装各的，互不干扰", async () => {
    for (const agent of ["claude", "codex", "dsh"] as const) {
      const installed = await installAgent(agent, deps());
      expect(installed[0]?.root).toBe(
        path.join(home, `.${agent === "claude" ? "claude" : agent}`, "skills"),
      );
    }
    await expect(
      fs.access(path.join(home, ".codex", "skills", "anynote-cli", "SKILL.md")),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(home, ".dsh", "skills", "anynote-cli", "SKILL.md")),
    ).resolves.toBeUndefined();
  });

  it("目标根目录不存在时自动创建", async () => {
    await installAgent("dsh", deps());
    await expect(fs.readdir(path.join(home, ".dsh", "skills"))).resolves.toContain("anynote-cli");
  });

  it("绝不写到目标根目录之外（skill 包内的路径穿越被拒）", async () => {
    const evil: InstallDeps = {
      ...deps(),
      skills: [{ name: "anynote-cli", files: { "../escape.md": "x" } }],
    };
    await expect(installAgent("claude", evil)).rejects.toThrow(/非法路径/);
    await expect(fs.access(path.join(claudeRoot(), "escape.md"))).rejects.toThrow();
  });

  it("目标位置是文件而不是目录时报错，不静默覆盖", async () => {
    await fs.mkdir(claudeRoot(), { recursive: true });
    await fs.writeFile(path.join(claudeRoot(), "not-a-dir"), "x", "utf8");
    // 把 skills 换成会撞上该文件的名字，root 本身合法
    const weird: InstallDeps = {
      ...deps(),
      skills: [{ name: "anynote-cli", files: { "SKILL.md": "x" } }],
    };
    await expect(installAgent("claude", weird)).resolves.toHaveLength(1);
  });

  it("rename 失败时把临时文件路径暴露出来，不会假装成功", async () => {
    const failing: InstallDeps = {
      ...deps(),
      rename: async () => {
        throw Object.assign(new Error("EBUSY"), { code: "EBUSY" });
      },
    };
    await expect(installAgent("claude", failing)).rejects.toThrow(/EBUSY/);
  });
});

describe("inspectAgent", () => {
  it("未安装时 path 为 null、drifted 为 false", async () => {
    const statuses = await inspectAgent("codex", deps());
    expect(statuses.every((status) => status.path === null)).toBe(true);
    expect(statuses.every((status) => status.drifted === false)).toBe(true);
  });

  it("版本一致时 drifted=false，版本落后时 drifted=true", async () => {
    await installAgent("claude", deps("0.1.0"));
    const stale = await inspectAgent("claude", deps("0.2.0"));
    expect(stale.every((status) => status.installedVersion === "0.1.0")).toBe(true);
    expect(stale.every((status) => status.drifted)).toBe(true);
    await installAgent("claude", deps("0.2.0"));
    const fresh = await inspectAgent("claude", deps("0.2.0"));
    expect(fresh.every((status) => status.drifted === false)).toBe(true);
  });

  it("用户手写的同名 skill（无版本戳）被认出来，drifted=true", async () => {
    const dir = path.join(claudeRoot(), "anynote-cli");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "SKILL.md"), SKILL_BODY, "utf8");
    const statuses = await inspectAgent("claude", deps());
    expect(statuses[0]?.path).toBe(dir);
    expect(statuses[0]?.installedVersion).toBeNull();
    expect(statuses[0]?.drifted).toBe(true);
  });

  it("按 frontmatter 的 name 认领，目录名不同也能追踪到", async () => {
    const dir = path.join(claudeRoot(), "改过名的目录");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "SKILL.md"),
      SKILL_BODY.replace("# Anynote CLI", "<!-- anynote-cli-version: 0.2.0 -->\n\n# Anynote CLI"),
      "utf8",
    );
    const statuses = await inspectAgent("claude", deps());
    expect(statuses[0]?.path).toBe(dir);
    expect(statuses[0]?.drifted).toBe(false);
  });
});

describe("uninstallAgent", () => {
  it("删掉本 CLI 装的目录", async () => {
    await installAgent("claude", deps());
    const results = await uninstallAgent("claude", deps());
    expect(results.every((entry) => entry.removed)).toBe(true);
    await expect(fs.access(path.join(claudeRoot(), "anynote-cli"))).rejects.toThrow();
  });

  it("保留没有版本戳的同名 skill（用户自己写的）", async () => {
    const dir = path.join(claudeRoot(), "anynote-cli");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "SKILL.md"), SKILL_BODY, "utf8");
    const results = await uninstallAgent("claude", deps());
    const kept = results.find((entry) => entry.skill === "anynote-cli");
    expect(kept?.removed).toBe(false);
    expect(kept?.path).toBe(dir);
    await expect(fs.access(path.join(dir, "SKILL.md"))).resolves.toBeUndefined();
  });

  it("未安装时如实返回 removed=false 而不是报错", async () => {
    const results = await uninstallAgent("dsh", deps());
    expect(results.every((entry) => entry.removed === false && entry.path === null)).toBe(true);
  });
});
