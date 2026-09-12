import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCommand, result } from "../core/command";
import { ExitCode } from "../core/exit";
import { registry } from "../core/registry";
import { buildManifest } from "../manifest/json";
import { renderManifestMarkdown } from "../manifest/markdown";
import { CLI_VERSION } from "../version";

const exitCodes = { ...ExitCode };

const sample = [
  defineCommand({
    name: "note get",
    summary: "读取笔记",
    description: "正文是 Markdown",
    endpoint: "GET /api/note/notes/{noteId}",
    args: z.object({
      id: z.coerce.number().int().positive().describe("笔记 ID"),
      out: z.string().optional().describe("写入文件"),
    }),
    positional: ["id"],
    examples: [{ cmd: "anynote note get 1", note: "示例" }],
    run: async () => result(null),
  }),
  defineCommand({
    name: "doc upload",
    summary: "上传文档",
    mutating: true,
    status: "blocked",
    args: z.object({}),
    run: async () => result(null),
  }),
];

describe("buildManifest", () => {
  it("同输入同输出：不含时间戳、机器名等易变内容", () => {
    const first = JSON.stringify(buildManifest(sample, "1.2.3", exitCodes));
    const second = JSON.stringify(buildManifest(sample, "1.2.3", exitCodes));
    expect(first).toBe(second);
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("命令按名称排序，与注册顺序无关", () => {
    const names = buildManifest([...sample].reverse(), "1.2.3", exitCodes).commands.map(
      (command) => command.name,
    );
    expect(names).toEqual(["doc upload", "note get"]);
  });

  it("带上 status / mutating / endpoint / positional", () => {
    const manifest = buildManifest(sample, "1.2.3", exitCodes);
    const [blocked, get] = manifest.commands;
    expect(blocked).toMatchObject({ name: "doc upload", status: "blocked", mutating: true });
    expect(get).toMatchObject({
      endpoint: "GET /api/note/notes/{noteId}",
      positional: ["id"],
      status: "stable",
      mutating: false,
    });
  });

  it("args 转成 JSON Schema，保留必填与描述", () => {
    const manifest = buildManifest(sample, "1.2.3", exitCodes);
    const schema = manifest.commands[1]?.args as {
      required?: string[];
      properties?: Record<string, { description?: string }>;
    };
    expect(schema.required).toEqual(["id"]);
    expect(schema.properties?.id?.description).toBe("笔记 ID");
  });

  it("退出码表被原样带上，供 agent 读取", () => {
    expect(buildManifest(sample, "1.2.3", exitCodes).exitCodes).toMatchObject({
      OK: 0,
      CONFLICT: 5,
      NOT_FOUND: 6,
    });
  });
});

describe("renderManifestMarkdown", () => {
  const manifest = buildManifest(sample, "1.2.3", exitCodes);

  it("渲染稳定：两次生成字节一致", () => {
    expect(renderManifestMarkdown(manifest)).toBe(renderManifestMarkdown(manifest));
  });

  it("首行声明是生成物，避免有人手改", () => {
    expect(renderManifestMarkdown(manifest)).toContain("不要手改");
  });

  it("位置参数写成 <id>，选项写成 --out", () => {
    const markdown = renderManifestMarkdown(manifest);
    expect(markdown).toContain("`<id>`");
    expect(markdown).toContain("`--out`");
  });

  it("标注 blocked 与写操作", () => {
    const markdown = renderManifestMarkdown(manifest);
    expect(markdown).toContain("后端阻塞");
    expect(markdown).toContain("写操作");
  });

  it("包含退出码表与全局约定", () => {
    const markdown = renderManifestMarkdown(manifest);
    expect(markdown).toContain("## 退出码");
    expect(markdown).toContain("--fields");
  });

  it("真实注册表也能完整渲染", () => {
    const markdown = renderManifestMarkdown(buildManifest(registry, CLI_VERSION, exitCodes));
    expect(markdown).toContain("`anynote base list`");
    expect(markdown).toContain("`anynote note set`");
  });
});

describe("版本号", () => {
  it("CLI_VERSION 与 package.json 保持一致", () => {
    const require = createRequire(import.meta.url);
    const pkg = require("../../package.json") as { version: string };
    expect(CLI_VERSION).toBe(pkg.version);
  });
});
