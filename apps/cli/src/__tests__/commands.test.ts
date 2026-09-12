import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authLogin, authLogout, authStatus, authWhoami } from "../commands/auth";
import { baseCreate, baseGet, baseList, baseRemove, baseUpdate } from "../commands/base";
import { configPath, doctor, manifest } from "../commands/meta";
import { noteCreate, noteGet, noteList, noteRecent, noteRemove, noteSet } from "../commands/note";
import { envelope, failure, makeContext } from "./helpers";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "anynote-cmd-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const COVER = "https://anynote.obs.cn-east-3.myhuaweicloud.com/images/knowledge_base_cover.png";

async function seedProfile(configDir: string) {
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, "credentials.json"),
    JSON.stringify({
      version: 1,
      current: "default",
      profiles: {
        default: {
          apiUrl: "http://gateway.test",
          accessToken: "at1",
          refreshToken: "rt1",
          username: "alice",
          obtainedAt: 1_700_000_000_000,
        },
      },
    }),
    "utf8",
  );
}

describe("auth", () => {
  it("login 落盘凭据且输出里不含 token", async () => {
    const { ctx } = makeContext({
      configDir: dir,
      routes: [
        {
          method: "POST",
          match: "/api/auth/login",
          body: envelope({
            username: "alice",
            nickname: "小爱",
            token: { accessToken: "at-new", refreshToken: "rt-new" },
          }),
        },
      ],
    });
    const output = await authLogin.run(ctx, {
      username: "alice",
      password: "pw",
      passwordStdin: false,
    });
    expect(JSON.stringify(output.data)).not.toContain("at-new");
    await expect(ctx.credentials.readProfile()).resolves.toMatchObject({
      accessToken: "at-new",
      refreshToken: "rt-new",
      username: "alice",
    });
  });

  it("login 用 --password 时给出安全告警", async () => {
    const { ctx, io } = makeContext({
      configDir: dir,
      routes: [
        {
          method: "POST",
          match: "/api/auth/login",
          body: envelope({ username: "alice", token: { accessToken: "a", refreshToken: "b" } }),
        },
      ],
    });
    await authLogin.run(ctx, { username: "alice", password: "pw", passwordStdin: false });
    expect(io.stderr).toContain("--password-stdin");
  });

  it("login 口令错误时抛 ApiError", async () => {
    const { ctx } = makeContext({
      configDir: dir,
      routes: [
        { method: "POST", match: "/api/auth/login", body: failure("A0201", "用户名或密码错误") },
      ],
    });
    await expect(
      authLogin.run(ctx, { username: "alice", password: "bad", passwordStdin: false }),
    ).rejects.toMatchObject({ code: "A0201" });
  });

  it("logout 撤销会话并清除本地 profile", async () => {
    await seedProfile(dir);
    const { ctx, calls } = makeContext({
      configDir: dir,
      routes: [{ method: "POST", match: "/api/auth/logout", body: envelope(null) }],
    });
    const output = await authLogout.run(ctx, {});
    expect(output.data).toEqual({ revoked: true });
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ accessToken: "at1", refreshToken: "rt1" });
    await expect(ctx.credentials.readProfile()).resolves.toBeNull();
  });

  it("没有凭据时 logout 幂等且不发请求", async () => {
    const { ctx, calls } = makeContext({ configDir: dir });
    const output = await authLogout.run(ctx, {});
    expect(output.data).toEqual({ revoked: false });
    expect(calls).toHaveLength(0);
  });

  it("whoami 打到 system 服务", async () => {
    await seedProfile(dir);
    const { ctx, calls } = makeContext({
      configDir: dir,
      routes: [
        {
          method: "GET",
          match: "/api/system/user/mine",
          body: envelope({ id: 9, username: "alice" }),
        },
      ],
    });
    await expect(authWhoami.run(ctx, {})).resolves.toMatchObject({ data: { id: 9 } });
    expect(new URL(calls[0]?.url ?? "").pathname).toBe("/api/system/user/mine");
  });

  it("status 是纯本地读取，不发请求也不打印 token", async () => {
    await seedProfile(dir);
    const { ctx, calls } = makeContext({ configDir: dir });
    const output = await authStatus.run(ctx, {});
    expect(calls).toHaveLength(0);
    expect(output.data).toMatchObject({
      authenticated: true,
      username: "alice",
      source: "profile",
    });
    expect(JSON.stringify(output.data)).not.toContain("at1");
  });

  it("使用 ANYNOTE_TOKEN 时 status 标注来源", async () => {
    const { ctx } = makeContext({ configDir: dir, envToken: "env-token" });
    await expect(authStatus.run(ctx, {})).resolves.toMatchObject({
      data: { source: "ANYNOTE_TOKEN", authenticated: true },
    });
  });
});

describe("base", () => {
  beforeEach(async () => {
    await seedProfile(dir);
  });

  it("list 传分页与权限，并裁剪成速览字段", async () => {
    const { ctx, calls } = makeContext({
      configDir: dir,
      routes: [
        {
          method: "GET",
          match: "/api/note/bases",
          body: envelope({
            rows: [
              { id: 70, knowledgeBaseName: "库", permissions: 1, updateTime: "t", cover: "c" },
            ],
            total: 1,
          }),
        },
      ],
    });
    const output = await baseList.run(ctx, { page: 1, limit: 20, permissions: 4 });
    const url = new URL(calls[0]?.url ?? "");
    expect(url.searchParams.get("pageSize")).toBe("20");
    expect(url.searchParams.get("permissions")).toBe("4");
    expect(output.data).toEqual([
      { id: 70, knowledgeBaseName: "库", permissions: 1, updateTime: "t" },
    ]);
  });

  it("list 为空时给出空数组而不是 null", async () => {
    const { ctx } = makeContext({
      configDir: dir,
      routes: [
        { method: "GET", match: "/api/note/bases", body: envelope({ rows: null, total: 0 }) },
      ],
    });
    await expect(baseList.run(ctx, { page: 1, limit: 20, permissions: 4 })).resolves.toMatchObject({
      data: [],
    });
  });

  it("get 不存在的知识库时抛 A0404", async () => {
    const { ctx } = makeContext({
      configDir: dir,
      routes: [
        { method: "GET", match: "/api/note/bases/999", body: failure("A0404", "获取知识库失败") },
      ],
    });
    await expect(baseGet.run(ctx, { id: 999 })).rejects.toMatchObject({ code: "A0404" });
  });

  it("create 默认带上封面与类型", async () => {
    const { ctx, calls } = makeContext({
      configDir: dir,
      routes: [{ method: "POST", match: "/api/note/bases", body: envelope({ id: 71 }) }],
    });
    const output = await baseCreate.run(ctx, {
      name: "新库",
      detail: "",
      cover: COVER,
      type: 0,
    });
    expect(output.data).toEqual({ id: 71 });
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      name: "新库",
      detail: "",
      cover: COVER,
      type: 0,
    });
  });

  it("update 先读当前知识库，再把 cover 一起回填", async () => {
    // 回归护栏：后端 @Url 切面会读请求体里的 cover，缺省直接 NPE 成 B0001
    const { ctx, calls } = makeContext({
      configDir: dir,
      routes: [
        {
          method: "GET",
          match: "/api/note/bases/70",
          bodies: [
            envelope({ id: 70, knowledgeBaseName: "旧名", detail: "旧简介", cover: COVER }),
            envelope({ id: 70, knowledgeBaseName: "新名", detail: "旧简介", cover: COVER }),
          ],
        },
        { method: "PUT", match: "/api/note/bases/70", body: envelope("SUCCESS") },
      ],
    });
    await baseUpdate.run(ctx, { id: 70, name: "新名" });

    const put = calls.find((call) => call.method === "PUT");
    expect(JSON.parse(put?.body ?? "{}")).toEqual({
      knowledgeBaseId: 70,
      name: "新名",
      detail: "旧简介",
      cover: COVER,
    });
    // 读 → 改 → 再读回最新状态
    expect(calls.map((call) => call.method)).toEqual(["GET", "PUT", "GET"]);
  });

  it("rm 删除后返回 id", async () => {
    const { ctx } = makeContext({
      configDir: dir,
      routes: [{ method: "DELETE", match: "/api/note/bases/70", body: envelope("SUCCESS") }],
    });
    await expect(baseRemove.run(ctx, { id: 70 })).resolves.toMatchObject({
      data: { id: 70, deleted: true },
    });
  });

  it("rm 无权限时抛业务错误", async () => {
    const { ctx } = makeContext({
      configDir: dir,
      routes: [
        {
          method: "DELETE",
          match: "/api/note/bases/70",
          body: failure("B0001", "没有权限删除知识库"),
        },
      ],
    });
    await expect(baseRemove.run(ctx, { id: 70 })).rejects.toMatchObject({
      code: "B0001",
      message: "没有权限删除知识库",
    });
  });
});

describe("note", () => {
  beforeEach(async () => {
    await seedProfile(dir);
  });

  it("list 走知识库维度的 POST 端点（新建笔记立即可见）", async () => {
    const { ctx, calls } = makeContext({
      configDir: dir,
      routes: [
        {
          method: "POST",
          match: "/api/note/notes/bases/70",
          body: envelope({ rows: [{ id: 1, title: "笔记", knowledgeBaseId: 70 }], total: 1 }),
        },
      ],
    });
    const output = await noteList.run(ctx, { base: 70, page: 1, limit: 20 });
    expect(new URL(calls[0]?.url ?? "").pathname).toBe("/api/note/notes/bases/70");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ page: 1, pageSize: 20 });
    expect(output.data).toEqual([{ id: 1, title: "笔记", knowledgeBaseId: 70, updateTime: null }]);
  });

  it("recent 走操作日志驱动的 GET /notes", async () => {
    const { ctx, calls } = makeContext({
      configDir: dir,
      routes: [{ method: "GET", match: "/api/note/notes", body: envelope({ rows: [], total: 0 }) }],
    });
    await noteRecent.run(ctx, { base: 70, page: 1, limit: 20 });
    const url = new URL(calls[0]?.url ?? "");
    expect(url.pathname).toBe("/api/note/notes");
    expect(url.searchParams.get("knowledgeBaseId")).toBe("70");
  });

  it("get 附带由 updateTime 派生的 version", async () => {
    const { ctx } = makeContext({
      configDir: dir,
      routes: [
        {
          method: "GET",
          match: "/api/note/notes/1",
          body: envelope({
            id: 1,
            title: "笔记",
            content: "# 正文",
            updateTime: "2026-09-12T01:36:15.000+08:00",
          }),
        },
      ],
    });
    const output = (await noteGet.run(ctx, { id: 1 })) as { data: { version: string | null } };
    expect(output.data.version).toBe(String(Date.parse("2026-09-12T01:36:15.000+08:00")));
  });

  it("get --out 把正文写进文件，stdout 只回执路径", async () => {
    const target = path.join(dir, "note.md");
    const { ctx } = makeContext({
      configDir: dir,
      routes: [
        { method: "GET", match: "/api/note/notes/1", body: envelope({ id: 1, content: "# 正文" }) },
      ],
    });
    const output = await noteGet.run(ctx, { id: 1, out: target });
    await expect(fs.readFile(target, "utf8")).resolves.toBe("# 正文");
    expect(output.data).toMatchObject({ out: target, bytes: Buffer.byteLength("# 正文") });
  });

  it("create 返回新笔记 id", async () => {
    const { ctx, calls } = makeContext({
      configDir: dir,
      routes: [{ method: "POST", match: "/api/note/notes", body: envelope(2571) }],
    });
    await expect(noteCreate.run(ctx, { base: 70, title: "会议纪要" })).resolves.toMatchObject({
      data: { id: 2571 },
    });
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ knowledgeBaseId: 70, title: "会议纪要" });
  });

  it("set 带 version 做乐观并发", async () => {
    const { ctx, calls } = makeContext({
      configDir: dir,
      routes: [
        { method: "PATCH", match: "/api/note/notes/1", body: envelope({ id: 1, version: "2" }) },
      ],
    });
    await noteSet.run(ctx, { id: 1, content: "新正文", version: "1", stdin: false, force: false });
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ content: "新正文", version: "1" });
  });

  it("set --force 时不带 version", async () => {
    const { ctx, calls } = makeContext({
      configDir: dir,
      routes: [
        { method: "PATCH", match: "/api/note/notes/1", body: envelope({ id: 1, version: "2" }) },
      ],
    });
    await noteSet.run(ctx, { id: 1, content: "覆盖", stdin: false, force: true });
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ content: "覆盖" });
  });

  it("set 冲突时抛 A0409", async () => {
    const { ctx } = makeContext({
      configDir: dir,
      routes: [
        {
          method: "PATCH",
          match: "/api/note/notes/1",
          body: failure("A0409", "笔记已被其他会话更新，请刷新后重试"),
        },
      ],
    });
    await expect(
      noteSet.run(ctx, { id: 1, content: "x", version: "1", stdin: false, force: false }),
    ).rejects.toMatchObject({ code: "A0409" });
  });

  it("set 既没 version 也没 force 时拒绝执行", async () => {
    const { ctx, calls } = makeContext({ configDir: dir });
    await expect(
      noteSet.run(ctx, { id: 1, content: "x", stdin: false, force: false }),
    ).rejects.toMatchObject({ name: "UsageError" });
    expect(calls).toHaveLength(0);
  });

  it("set 同时给多种正文来源时拒绝执行", async () => {
    const { ctx, calls } = makeContext({ configDir: dir });
    await expect(
      noteSet.run(ctx, { id: 1, content: "x", file: "a.md", stdin: false, force: true }),
    ).rejects.toMatchObject({ name: "UsageError" });
    expect(calls).toHaveLength(0);
  });

  it("set 什么都不改时拒绝执行", async () => {
    const { ctx, calls } = makeContext({ configDir: dir });
    await expect(noteSet.run(ctx, { id: 1, stdin: false, force: true })).rejects.toMatchObject({
      name: "UsageError",
    });
    expect(calls).toHaveLength(0);
  });

  it("set --file 从文件读正文", async () => {
    const file = path.join(dir, "in.md");
    await fs.writeFile(file, "# 来自文件", "utf8");
    const { ctx, calls } = makeContext({
      configDir: dir,
      routes: [{ method: "PATCH", match: "/api/note/notes/1", body: envelope({ id: 1 }) }],
    });
    await noteSet.run(ctx, { id: 1, file, stdin: false, force: true });
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ content: "# 来自文件" });
  });

  it("rm 删除笔记", async () => {
    const { ctx } = makeContext({
      configDir: dir,
      routes: [{ method: "DELETE", match: "/api/note/notes/1", body: envelope("SUCCESS") }],
    });
    await expect(noteRemove.run(ctx, { id: 1 })).resolves.toMatchObject({
      data: { id: 1, deleted: true },
    });
  });
});

describe("meta", () => {
  it("manifest --format=json 输出命令清单", async () => {
    const { ctx } = makeContext({ configDir: dir, commands: [baseList, noteGet] });
    const output = (await manifest.run(ctx, { format: "json", write: false })) as {
      data: { commands: Array<{ name: string }> };
    };
    expect(output.data.commands.map((command) => command.name)).toEqual(["base list", "note get"]);
  });

  it("manifest --format=json --write 被拒绝", async () => {
    const { ctx } = makeContext({ configDir: dir, commands: [baseList] });
    await expect(manifest.run(ctx, { format: "json", write: true })).rejects.toMatchObject({
      name: "UsageError",
    });
  });

  it("manifest --write 落到指定根目录下的生成物路径", async () => {
    const { ctx } = makeContext({ configDir: dir, commands: [baseList] });
    await manifest.run(ctx, { format: "markdown", write: true, root: dir });
    await expect(fs.readFile(path.join(dir, "docs/cli/COMMANDS.md"), "utf8")).resolves.toContain(
      "Anynote CLI 命令速查",
    );
    await expect(
      fs.readFile(path.join(dir, ".claude/skills/anynote-cli/reference/commands.md"), "utf8"),
    ).resolves.toContain("Anynote CLI 命令速查");
  });

  it("doctor 汇报网关状态与凭据状态", async () => {
    await seedProfile(dir);
    const { ctx } = makeContext({ configDir: dir, commands: [baseList] });
    const output = (await doctor.run(ctx, {})) as {
      data: { gateway: string; authenticated: boolean };
    };
    // doctor 直接打 actuator，不走注入的桩 fetch，这里只断言它把失败归一化成可读字符串
    expect(typeof output.data.gateway).toBe("string");
    expect(output.data.authenticated).toBe(true);
  });

  it("config path 输出凭据与锁文件位置", async () => {
    const { ctx } = makeContext({ configDir: dir });
    await expect(configPath.run(ctx, {})).resolves.toMatchObject({
      data: {
        configDir: dir,
        credentialsPath: path.join(dir, "credentials.json"),
        lockPath: path.join(dir, ".refresh.lock"),
      },
    });
  });
});
