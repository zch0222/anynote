import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type CliRun,
  GATEWAY,
  ensureBuilt,
  expectOk,
  makeHome,
  randomAccount,
  runCli,
} from "./helpers";

/**
 * CLI 端到端用例：驱动构建产物打真实的本地 Anynote 栈（docker compose 全栈）。
 *
 * 覆盖当前实现的全部命令，重点是知识库与笔记的增删改查闭环、退出码契约、
 * 以及 Markdown 正文的往返一致性。
 *
 * 运行前置：
 *   1. 本地全栈已起（gateway :8080 healthy）
 *   2. pnpm --filter @anynote/cli build
 * 运行：pnpm --filter @anynote/cli test:e2e
 *
 * 账号：每次创建一个随机 e2e 前缀账号并在结束时登出；账号记录保留，不要在生产环境跑。
 */

const account = randomAccount();
let home: string;
let baseId: number;
let noteId: number;
let secondBaseId: number;
/** skill 安装用例的隔离根目录：三家 agent 的全局目录都指到这里 */
let agentHome: string;

beforeAll(async () => {
  await ensureBuilt();
  home = await makeHome();
  agentHome = await makeHome();
  const registered = await runCli(
    home,
    [
      "auth",
      "register",
      "--username",
      account.username,
      "--nickname",
      account.nickname,
      "--password-stdin",
    ],
    { stdin: account.password },
  );
  expectOk(registered, "auth register");
  console.info(`本次临时账号：${account.username}`);
});

afterAll(async () => {
  if (!home) return;
  await runCli(home, ["auth", "logout"]);
  await fs.rm(home, { recursive: true, force: true });
  if (agentHome) await fs.rm(agentHome, { recursive: true, force: true });
});

/** 跑 CLI 时把 agent 的全局 skill 目录隔离到 agentHome 下。 */
function runSkill(args: string[], options: { stdin?: string } = {}) {
  return runCli(home, args, {
    ...options,
    extraEnv: {
      CLAUDE_CONFIG_DIR: path.join(agentHome, "claude"),
      CODEX_HOME: path.join(agentHome, "codex"),
      DSH_HOME: path.join(agentHome, "dsh"),
    },
  });
}

function dataOf(run: CliRun, label: string) {
  return expectOk(run, label) as Record<string, unknown>;
}

describe("元命令", () => {
  it("doctor 报告网关可达且命令数非零", async () => {
    const run = await runCli(home, ["doctor"]);
    const data = dataOf(run, "doctor");
    expect(data.gateway).toBe("UP");
    expect(data.authenticated).toBe(true);
    expect(Number(data.commands)).toBeGreaterThan(0);
  });

  it("manifest --format=json 可被解析且含退出码表", async () => {
    const run = await runCli(home, ["manifest", "--format=json"]);
    const data = dataOf(run, "manifest") as {
      commands: unknown[];
      exitCodes: Record<string, number>;
    };
    expect(Array.isArray(data.commands)).toBe(true);
    expect(data.exitCodes).toMatchObject({ OK: 0, CONFLICT: 5, NOT_FOUND: 6 });
  });

  it("manifest 两次输出完全一致（可入库并用 diff 卡漂移）", async () => {
    const first = await runCli(home, ["manifest", "--format=markdown"]);
    const second = await runCli(home, ["manifest", "--format=markdown"]);
    expect(first.stdout).toBe(second.stdout);
  });

  it("config path 指向本次测试的临时目录", async () => {
    const data = dataOf(await runCli(home, ["config", "path"]), "config path");
    expect(data.credentialsPath).toBe(path.join(home, "credentials.json"));
  });

  it("--help 退出码为 0", async () => {
    const run = await runCli(home, ["--help"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("Usage:");
  });
});

describe("认证", () => {
  it("whoami 返回刚注册的账号", async () => {
    const data = dataOf(await runCli(home, ["auth", "whoami"]), "auth whoami");
    expect(data.username).toBe(account.username);
  });

  it("status 显示已认证且不泄漏 token", async () => {
    const run = await runCli(home, ["auth", "status"]);
    const data = dataOf(run, "auth status");
    expect(data.authenticated).toBe(true);
    expect(data.username).toBe(account.username);
    const credentials = await fs.readFile(path.join(home, "credentials.json"), "utf8");
    const accessToken = JSON.parse(credentials).profiles.default.accessToken as string;
    expect(run.stdout).not.toContain(accessToken);
  });

  it("凭据缺失时以退出码 2 提示登录", async () => {
    const empty = await makeHome();
    const run = await runCli(empty, ["auth", "whoami"]);
    expect(run.code).toBe(2);
    expect(run.error?.message).toContain("auth login");
    await fs.rm(empty, { recursive: true, force: true });
  });

  it("口令错误时登录失败且不覆盖本地凭据", async () => {
    const run = await runCli(
      home,
      ["auth", "login", "--username", account.username, "--password-stdin"],
      { stdin: "WrongPassword1" },
    );
    expect(run.code).toBe(1);
    expect(run.error?.code).not.toBe("00000");
    const still = dataOf(await runCli(home, ["auth", "whoami"]), "auth whoami after failed login");
    expect(still.username).toBe(account.username);
  });

  it("重新登录可以覆盖写入凭据", async () => {
    const run = await runCli(
      home,
      ["auth", "login", "--username", account.username, "--password-stdin"],
      { stdin: account.password },
    );
    const data = dataOf(run, "auth login");
    expect(data.username).toBe(account.username);
  });
});

describe("知识库增删改查", () => {
  it("create 返回新知识库 ID", async () => {
    const data = dataOf(
      await runCli(home, ["base", "create", "--name", "CLI端到端库", "--detail", "e2e", "--yes"]),
      "base create",
    );
    baseId = Number(data.id);
    expect(baseId).toBeGreaterThan(0);
  });

  it("get 能读回刚建的知识库", async () => {
    const data = dataOf(await runCli(home, ["base", "get", String(baseId)]), "base get");
    expect(data.id).toBe(baseId);
    expect(data.knowledgeBaseName).toBe("CLI端到端库");
    expect(data.detail).toBe("e2e");
  });

  it("list 能列出它，并支持 --fields 裁剪", async () => {
    const run = await runCli(home, ["base", "list", "--fields", "id,knowledgeBaseName"]);
    const rows = expectOk(run, "base list") as Array<Record<string, unknown>>;
    const found = rows.find((row) => row.id === baseId);
    expect(found).toBeDefined();
    expect(Object.keys(found ?? {})).toEqual(["id", "knowledgeBaseName"]);
  });

  it("update 改名成功（内部自动回填 cover，避免后端 @Url 切面 NPE）", async () => {
    const data = dataOf(
      await runCli(home, ["base", "update", String(baseId), "--name", "CLI改名库", "--yes"]),
      "base update",
    );
    expect(data.knowledgeBaseName).toBe("CLI改名库");
    const reread = dataOf(
      await runCli(home, ["base", "get", String(baseId)]),
      "base get after update",
    );
    expect(reread.knowledgeBaseName).toBe("CLI改名库");
  });

  it('不存在的知识库返回 A0301（后端不区分"不存在"与"无权限"）', async () => {
    // 与笔记不同：知识库的权限切面先于存在性检查执行，查不到权限记录就报 A0301，
    // 因此退出码是 3 而不是 6。这条差异必须写进 skills，否则 agent 会误以为要重新登录。
    const run = await runCli(home, ["base", "get", "999999999"]);
    expect(run.code).toBe(3);
    expect(run.error?.code).toBe("A0301");
  });

  it("非交互环境缺 --yes 时拒绝删除且不落库", async () => {
    const refused = await runCli(home, ["base", "rm", String(baseId)]);
    expect(refused.code).toBe(2);
    expect(refused.error?.message).toContain("--yes");
    const still = dataOf(
      await runCli(home, ["base", "get", String(baseId)]),
      "base get after refusal",
    );
    expect(still.id).toBe(baseId);
  });

  it("--dry-run 只预览不执行", async () => {
    const run = await runCli(home, ["base", "rm", String(baseId), "--yes", "--dry-run"]);
    const data = dataOf(run, "base rm --dry-run");
    expect(data.executed).toBe(false);
    const still = dataOf(
      await runCli(home, ["base", "get", String(baseId)]),
      "base get after dry-run",
    );
    expect(still.id).toBe(baseId);
  });
});

describe("笔记增删改查", () => {
  it("create 返回新笔记 ID", async () => {
    const data = dataOf(
      await runCli(home, [
        "note",
        "create",
        "--base",
        String(baseId),
        "--title",
        "端到端笔记",
        "--yes",
      ]),
      "note create",
    );
    noteId = Number(data.id);
    expect(noteId).toBeGreaterThan(0);
  });

  it("list 立即能看到新建的笔记", async () => {
    const rows = expectOk(
      await runCli(home, ["note", "list", "--base", String(baseId)]),
      "note list",
    ) as Array<Record<string, unknown>>;
    expect(rows.map((row) => row.id)).toContain(noteId);
  });

  it("get 返回 version，供乐观并发使用", async () => {
    const data = dataOf(await runCli(home, ["note", "get", String(noteId)]), "note get");
    expect(data.id).toBe(noteId);
    expect(typeof data.version).toBe("string");
  });

  it("set 写入 Markdown 正文并返回新 version", async () => {
    const before = dataOf(
      await runCli(home, ["note", "get", String(noteId)]),
      "note get before set",
    );
    const markdown = "# 端到端标题\n\n- 列表项\n- 另一项\n\n正文由 CLI 写入。";
    const saved = dataOf(
      await runCli(home, [
        "note",
        "set",
        String(noteId),
        "--content",
        markdown,
        "--version",
        String(before.version),
        "--yes",
      ]),
      "note set",
    );
    expect(saved.content).toBe(markdown);
    expect(saved.version).not.toBe(before.version);
  });

  it("Markdown 正文往返一致（--out 落盘再读回）", async () => {
    const target = path.join(home, "note.md");
    const written = dataOf(
      await runCli(home, ["note", "get", String(noteId), "--out", target]),
      "note get --out",
    );
    expect(written.out).toBe(target);
    const onDisk = await fs.readFile(target, "utf8");
    const data = dataOf(
      await runCli(home, ["note", "get", String(noteId)]),
      "note get for compare",
    );
    expect(onDisk).toBe(data.content);
    expect(onDisk).toContain("# 端到端标题");
  });

  it("set --file 从文件写入", async () => {
    const source = path.join(home, "next.md");
    await fs.writeFile(source, "# 来自文件\n\n第二版正文。", "utf8");
    const before = dataOf(
      await runCli(home, ["note", "get", String(noteId)]),
      "note get before file set",
    );
    const saved = dataOf(
      await runCli(home, [
        "note",
        "set",
        String(noteId),
        "--file",
        source,
        "--version",
        String(before.version),
        "--yes",
      ]),
      "note set --file",
    );
    expect(saved.content).toBe("# 来自文件\n\n第二版正文。");
  });

  it("set --title 改标题", async () => {
    const before = dataOf(
      await runCli(home, ["note", "get", String(noteId)]),
      "note get before title",
    );
    const saved = dataOf(
      await runCli(home, [
        "note",
        "set",
        String(noteId),
        "--title",
        "改过的标题",
        "--version",
        String(before.version),
        "--yes",
      ]),
      "note set --title",
    );
    expect(saved.title).toBe("改过的标题");
  });

  it("用过期 version 保存时以退出码 5 报冲突", async () => {
    const run = await runCli(home, [
      "note",
      "set",
      String(noteId),
      "--content",
      "不该写进去",
      "--version",
      "1",
      "--yes",
    ]);
    expect(run.code).toBe(5);
    expect(run.error?.code).toBe("A0409");
    const data = dataOf(
      await runCli(home, ["note", "get", String(noteId)]),
      "note get after conflict",
    );
    expect(data.content).not.toBe("不该写进去");
  });

  it("缺少 version 且未 --force 时直接拒绝", async () => {
    const run = await runCli(home, ["note", "set", String(noteId), "--content", "x", "--yes"]);
    expect(run.code).toBe(2);
    expect(run.error?.message).toContain("--version");
  });

  it("--force 可以跳过冲突检测", async () => {
    const saved = dataOf(
      await runCli(home, [
        "note",
        "set",
        String(noteId),
        "--content",
        "强制覆盖",
        "--force",
        "--yes",
      ]),
      "note set --force",
    );
    expect(saved.content).toBe("强制覆盖");
  });

  it("recent 能看到已编辑过的笔记", async () => {
    const rows = expectOk(
      await runCli(home, ["note", "recent", "--base", String(baseId)]),
      "note recent",
    ) as Array<Record<string, unknown>>;
    expect(rows.map((row) => row.id)).toContain(noteId);
  });

  it("mv 把笔记移动到另一个知识库", async () => {
    const created = dataOf(
      await runCli(home, ["base", "create", "--name", "CLI第二库", "--yes"]),
      "base create #2",
    );
    secondBaseId = Number(created.id);
    dataOf(
      await runCli(home, ["note", "mv", String(noteId), "--base", String(secondBaseId), "--yes"]),
      "note mv",
    );
    const moved = dataOf(await runCli(home, ["note", "get", String(noteId)]), "note get after mv");
    expect(moved.knowledgeBaseId).toBe(secondBaseId);
  });

  it("不存在的笔记以退出码 6 返回", async () => {
    const run = await runCli(home, ["note", "get", "999999999"]);
    expect(run.code).toBe(6);
    expect(run.error?.code).toBe("A0404");
  });

  it("rm 删除笔记后就查不到了", async () => {
    dataOf(await runCli(home, ["note", "rm", String(noteId), "--yes"]), "note rm");
    const gone = await runCli(home, ["note", "get", String(noteId)]);
    expect(gone.code).toBe(6);
  });
});

describe("清理与删除权限", () => {
  it("创建者可以删除自己的知识库", async () => {
    // 后端原本把权限判断写反了（创建者反而无权删除），修复见
    // KnowledgeBaseServiceImpl#deleteKnowledgeBaseById 与对应单测
    for (const id of [baseId, secondBaseId]) {
      const run = await runCli(home, ["base", "rm", String(id), "--yes"]);
      const data = dataOf(run, `base rm ${id}`);
      expect(data.deleted).toBe(true);
    }
    const gone = await runCli(home, ["base", "get", String(baseId)]);
    // 删掉的知识库仍留有该用户的权限记录，权限切面放行后才查不到实体，
    // 因此这里是 A0404（退出码 6）；而从未存在过的 id 会更早被切面拦成 A0301（退出码 3）
    expect(gone.code).toBe(6);
    expect(gone.error?.code).toBe("A0404");
  });
});

describe("skill 一键安装", () => {
  const skills = ["anynote-cli", "anynote-notes"];

  it("doctor 报告三家 agent 的 skill 安装情况", async () => {
    const data = dataOf(await runCli(home, ["doctor"]), "doctor") as {
      skills: Array<{ agent: string; installed: number; total: number; drifted: boolean }>;
    };
    expect(data.skills.map((row) => row.agent)).toEqual(["claude", "codex", "dsh"]);
    // 本用例的隔离目录还是空的
    expect(data.skills.every((row) => row.installed === 0)).toBe(true);
  });

  it("install 把两个 skill 复制到三家全局目录", async () => {
    const data = dataOf(await runSkill(["skill", "install"]), "skill install") as {
      version: string;
      skills: string[];
      installed: Array<{ agent: string; action: string; path: string }>;
    };
    expect(data.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(data.skills).toEqual(skills);
    expect(data.installed).toHaveLength(skills.length * 3);
    expect(data.installed.every((entry) => entry.action === "installed")).toBe(true);

    for (const agent of ["claude", "codex", "dsh"]) {
      for (const skill of skills) {
        const root = path.join(agentHome, agent, "skills", skill, "SKILL.md");
        const body = await fs.readFile(root, "utf8");
        // 版本戳必须等于本次 CLI 的版本：这正是"skill 与 CLI 版本匹配"的落地形式
        expect(body).toContain(`anynote-cli-version: ${data.version}`);
      }
    }
  });

  it("装出来的目录里带 reference/commands.md（agent 加载 skill 时要读）", async () => {
    const reference = path.join(
      agentHome,
      "claude",
      "skills",
      "anynote-cli",
      "reference",
      "commands.md",
    );
    const body = await fs.readFile(reference, "utf8");
    expect(body).toContain("anynote skill install");
  });

  it("重复 install 是幂等的", async () => {
    const data = dataOf(await runSkill(["skill", "install"]), "skill install again") as {
      installed: Array<{ action: string }>;
    };
    expect(data.installed.every((entry) => entry.action === "unchanged")).toBe(true);
  });

  it("skill list 报告已安装且版本一致", async () => {
    const data = dataOf(await runSkill(["skill", "list"]), "skill list") as {
      rows: Array<{ installed: boolean; drifted: boolean; installedVersion: string | null }>;
    };
    expect(data.rows).toHaveLength(skills.length * 3);
    expect(data.rows.every((row) => row.installed && !row.drifted)).toBe(true);
    expect(data.rows.every((row) => row.installedVersion !== null)).toBe(true);
  });

  it("用户手写的同名 skill 不会被覆盖，也不会被卸载", async () => {
    const dshSkills = path.join(agentHome, "dsh", "skills");
    // 先把 dsh 清空，只留用户手写的那一个，避免与前面用例的安装状态纠缠
    await fs.rm(dshSkills, { recursive: true, force: true });
    const foreign = path.join(dshSkills, "anynote-cli");
    await fs.mkdir(foreign, { recursive: true });
    await fs.writeFile(
      path.join(foreign, "SKILL.md"),
      "---\nname: anynote-cli\ndescription: 用户自己写的\n---\n",
      "utf8",
    );

    // 安装：dsh 因为 anynote-cli 撞名而被整体跳过，另外两家照装
    const installed = dataOf(
      await runSkill(["skill", "install"]),
      "skill install (dsh occupied)",
    ) as {
      installed: Array<{ agent: string }>;
      skipped: string[];
    };
    expect(installed.installed.every((entry) => entry.agent !== "dsh")).toBe(true);
    expect(installed.skipped.join()).toContain("不是 anynote CLI 安装的");
    await expect(fs.readFile(path.join(foreign, "SKILL.md"), "utf8")).resolves.toContain(
      "用户自己写的",
    );

    // 卸载是删除操作，非交互环境必须显式 --yes（与其它写操作同一套守卫）
    const refused = await runSkill(["skill", "uninstall", "--agent=dsh"]);
    expect(refused.code).toBe(2);
    expect(refused.error?.message).toContain("--yes");

    // 卸载：只该删本 CLI 装的，用户手写的那个原封不动
    const removed = dataOf(
      await runSkill(["skill", "uninstall", "--agent=dsh", "--yes"]),
      "skill uninstall (dsh occupied)",
    ) as { removed: unknown[]; kept: Array<{ path: string }> };
    expect(removed.removed).toHaveLength(0);
    expect(removed.kept.map((entry) => entry.path)).toEqual([foreign]);
    await expect(fs.readFile(path.join(foreign, "SKILL.md"), "utf8")).resolves.toContain(
      "用户自己写的",
    );

    // 复原：清掉手写的那份，让后面的 uninstall 用例拿到干净的三家安装
    await fs.rm(dshSkills, { recursive: true, force: true });
    dataOf(await runSkill(["skill", "install", "--agent=dsh"]), "skill install (dsh restored)");
  });

  it("uninstall 删除本 CLI 装的全部 skill", async () => {
    const data = dataOf(await runSkill(["skill", "uninstall", "--yes"]), "skill uninstall") as {
      removed: unknown[];
    };
    expect(data.removed).toHaveLength(skills.length * 3);
    for (const agent of ["claude", "codex", "dsh"]) {
      await expect(
        fs.access(path.join(agentHome, agent, "skills", "anynote-cli")),
      ).rejects.toThrow();
    }
  });
});

describe("配置持久化", () => {
  it("config set 落盘后，后续命令没有环境变量也用它", async () => {
    const persisted = await makeHome();
    try {
      const stored = dataOf(
        await runCli(persisted, ["config", "set", "api-url", GATEWAY]),
        "config set",
      ) as { settingsPath: string; value: string };
      expect(stored.value).toBe(GATEWAY);
      const raw = JSON.parse(await fs.readFile(stored.settingsPath, "utf8")) as { apiUrl: string };
      expect(raw.apiUrl).toBe(GATEWAY);

      // 关键：这一跑不带 ANYNOTE_API_URL，地址只能来自设置文件
      const data = dataOf(
        await runCli(persisted, ["config", "path"], { withoutApiUrl: true }),
        "config path",
      ) as { apiUrl: string; apiUrlSource: string };
      expect(data.apiUrlSource).toBe("file");
      expect(data.apiUrl).toBe(GATEWAY);
    } finally {
      await fs.rm(persisted, { recursive: true, force: true });
    }
  });

  it("config set 拒绝非法 URL", async () => {
    const run = await runCli(home, ["config", "set", "api-url", "192.168.3.90:8080"]);
    expect(run.code).toBe(2);
    expect(run.error?.message).toContain("URL");
  });

  it("config unset 之后设置文件里的键被删掉", async () => {
    const persisted = await makeHome();
    try {
      await runCli(persisted, ["config", "set", "api-url", GATEWAY]);
      dataOf(await runCli(persisted, ["config", "unset", "api-url"]), "config unset");
      const stored = JSON.parse(
        await fs.readFile(path.join(persisted, "settings.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(stored.apiUrl).toBeUndefined();
      const data = dataOf(
        await runCli(persisted, ["config", "get"], { withoutApiUrl: true }),
        "config get",
      ) as { apiUrlSource: string; apiUrl: string };
      expect(data.apiUrlSource).toBe("default");
      expect(data.apiUrl).toBe("http://localhost:8080");
    } finally {
      await fs.rm(persisted, { recursive: true, force: true });
    }
  });

  it("登录态跨进程持久化：新进程直接 whoami 成功", async () => {
    // 每次 runCli 都是一次独立的 node 进程，凭据只能来自 credentials.json
    const data = dataOf(await runCli(home, ["auth", "whoami"]), "auth whoami") as {
      username: string;
    };
    expect(data.username).toBe(account.username);
  });
});
