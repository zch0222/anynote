import fs from "node:fs/promises";
import {
  DEFAULT_PAGE_SIZE,
  noteDetailSchema,
  noteListItemSchema,
  noteSaveResultSchema,
  pageBeanSchema,
  toVersion,
  unwrapEnvelope,
} from "@anynote/api-core";
import { z } from "zod";
import { defineCommand, result } from "../core/command";
import type { CliContext } from "../core/context";
import { UsageError } from "../core/exit";

const notePageSchema = pageBeanSchema(noteListItemSchema);
const createdNoteSchema = z.number();

const LIST_FIELDS = ["id", "title", "knowledgeBaseId", "updateTime"] as const;

function projectList(rows: Array<Record<string, unknown>>) {
  return rows.map((row) =>
    Object.fromEntries(LIST_FIELDS.map((field) => [field, row[field] ?? null])),
  );
}

async function fetchNote(ctx: CliContext, noteId: number) {
  const { response } = await ctx.api.note.GET("/notes/{noteId}", {
    params: { path: { noteId } },
    parseAs: "stream",
  });
  const note = await unwrapEnvelope(response, noteDetailSchema.parse);
  return { ...note, version: toVersion(note.updateTime) };
}

export const noteList = defineCommand({
  name: "note list",
  summary: "列出某个知识库里的笔记",
  description:
    "走 POST /notes/bases/{baseId}，新建的笔记立即可见。若要看「我最近操作过的笔记」用 note recent。",
  endpoint: "POST /api/note/notes/bases/{baseId}",
  args: z.object({
    base: z.coerce.number().int().positive().describe("知识库 ID"),
    page: z.coerce.number().int().min(1).default(1).describe("页码，从 1 起"),
    limit: z.coerce.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE).describe("每页条数"),
  }),
  examples: [{ cmd: "anynote note list --base 70 --json" }],
  run: async (ctx, args) => {
    const { response } = await ctx.api.note.POST("/notes/bases/{baseId}", {
      params: { path: { baseId: args.base } },
      body: { page: args.page, pageSize: args.limit },
      parseAs: "stream",
    });
    const page = await unwrapEnvelope(response, notePageSchema.parse);
    return result(projectList(page.rows as Array<Record<string, unknown>>));
  },
});

export const noteRecent = defineCommand({
  name: "note recent",
  summary: "列出我最近操作过的笔记",
  description:
    "走 GET /notes，数据来自笔记操作日志，按最近操作时间倒序。**刚创建还没编辑过的笔记不会出现在这里**，" +
    "要看知识库内全部笔记请用 note list --base。",
  endpoint: "GET /api/note/notes",
  args: z.object({
    base: z.coerce.number().int().positive().describe("知识库 ID（后端必填）"),
    page: z.coerce.number().int().min(1).default(1).describe("页码，从 1 起"),
    limit: z.coerce.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE).describe("每页条数"),
  }),
  examples: [{ cmd: "anynote note recent --base 70" }],
  run: async (ctx, args) => {
    const { response } = await ctx.api.note.GET("/notes", {
      params: { query: { page: args.page, pageSize: args.limit, knowledgeBaseId: args.base } },
      parseAs: "stream",
    });
    const page = await unwrapEnvelope(response, notePageSchema.parse);
    return result(projectList(page.rows as Array<Record<string, unknown>>));
  },
});

export const noteGet = defineCommand({
  name: "note get",
  summary: "读取笔记，正文是 Markdown",
  description:
    "人类模式直接把 Markdown 正文写到 stdout（可重定向成 .md 文件）；--json 返回含 version 的结构体，" +
    "该 version 是 note set 做乐观并发所必需的。",
  endpoint: "GET /api/note/notes/{noteId}",
  args: z.object({
    id: z.coerce.number().int().positive().describe("笔记 ID"),
    out: z.string().min(1).optional().describe("把正文写入文件而不是打印"),
  }),
  positional: ["id"],
  examples: [
    { cmd: "anynote note get 2571 > note.md" },
    { cmd: "anynote note get 2571 --json", note: "取 version 用于后续保存" },
  ],
  run: async (ctx, args) => {
    const note = await fetchNote(ctx, args.id);
    if (args.out) {
      await fs.writeFile(args.out, note.content ?? "", "utf8");
      return result(
        {
          id: note.id,
          out: args.out,
          bytes: Buffer.byteLength(note.content ?? ""),
          version: note.version,
        },
        { render: (data) => `已写入 ${data.out}（${data.bytes} 字节）` },
      );
    }
    return result(note, { render: (data) => data.content ?? "" });
  },
});

export const noteCreate = defineCommand({
  name: "note create",
  summary: "在知识库里新建笔记",
  description: "标题长度 3-15（后端 @Size 限制）。返回新笔记 ID。正文请随后用 note set 写入。",
  endpoint: "POST /api/note/notes",
  mutating: true,
  args: z.object({
    base: z.coerce.number().int().positive().describe("知识库 ID"),
    title: z.string().trim().min(3).max(15).describe("笔记标题，3-15 字符"),
  }),
  examples: [{ cmd: 'anynote note create --base 70 --title "会议纪要" --yes' }],
  run: async (ctx, args) => {
    const { response } = await ctx.api.note.POST("/notes", {
      body: { knowledgeBaseId: args.base, title: args.title },
      parseAs: "stream",
    });
    const id = await unwrapEnvelope(response, createdNoteSchema.parse);
    return result({ id }, { render: (data) => String(data.id) });
  },
});

export const noteSet = defineCommand({
  name: "note set",
  summary: "写入笔记标题 / 正文（Markdown）",
  description:
    "正文来源三选一：--file、--content、--stdin。必须给 --version（来自 note get --json）做乐观并发；" +
    "确实要覆盖时用 --force 跳过检测。版本冲突退出码为 5，此时应重新 note get、合并内容、带新 version 重试。",
  endpoint: "PATCH /api/note/notes/{noteId}",
  mutating: true,
  args: z.object({
    id: z.coerce.number().int().positive().describe("笔记 ID"),
    file: z.string().min(1).optional().describe("从文件读取 Markdown 正文"),
    content: z.string().optional().describe("直接给出 Markdown 正文"),
    stdin: z.boolean().default(false).describe("从标准输入读取 Markdown 正文"),
    title: z.string().trim().min(1).max(15).optional().describe("新标题"),
    version: z.string().min(1).optional().describe("note get --json 返回的 version"),
    force: z.boolean().default(false).describe("跳过版本冲突检测，后写入者胜出"),
  }),
  positional: ["id"],
  examples: [
    { cmd: "anynote note set 2571 --file note.md --version 1789148175000 --yes" },
    { cmd: 'anynote note set 2571 --content "# 标题" --force --yes' },
  ],
  run: async (ctx, args) => {
    const sources = [args.file, args.content, args.stdin ? "stdin" : undefined].filter(
      (source) => source !== undefined,
    );
    if (sources.length > 1) throw new UsageError("--file / --content / --stdin 只能给一个");
    if (!args.version && !args.force) {
      throw new UsageError(
        "缺少 --version：先跑 anynote note get <id> --json 取 version，或显式 --force 放弃冲突检测",
      );
    }

    let content: string | undefined;
    if (args.file) content = await fs.readFile(args.file, "utf8");
    else if (args.content !== undefined) content = args.content;
    else if (args.stdin) {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
      content = Buffer.concat(chunks).toString("utf8");
    }

    if (content === undefined && args.title === undefined) {
      throw new UsageError("没有要修改的内容：至少给 --title 或一种正文来源");
    }

    const { response } = await ctx.api.note.PATCH("/notes/{noteId}", {
      params: { path: { noteId: args.id } },
      body: {
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(!args.force && args.version ? { version: args.version } : {}),
      },
      parseAs: "stream",
    });
    const saved = await unwrapEnvelope(response, noteSaveResultSchema.parse);
    return result(saved, {
      render: (data) => `已保存笔记 ${data.id}，新 version=${data.version ?? "-"}`,
      notes: ["Markdown 往返会丢失文本对齐等无 Markdown 表达的属性"],
    });
  },
});

export const noteMove = defineCommand({
  name: "note mv",
  summary: "把笔记移动到另一个知识库",
  description: "需要对目标知识库有编辑权限。同样支持 --version 做乐观并发。",
  endpoint: "PATCH /api/note/notes/{noteId}",
  mutating: true,
  args: z.object({
    id: z.coerce.number().int().positive().describe("笔记 ID"),
    base: z.coerce.number().int().positive().describe("目标知识库 ID"),
    version: z.string().min(1).optional().describe("note get --json 返回的 version"),
  }),
  positional: ["id"],
  examples: [{ cmd: "anynote note mv 2571 --base 71 --yes" }],
  run: async (ctx, args) => {
    const { response } = await ctx.api.note.PATCH("/notes/{noteId}", {
      params: { path: { noteId: args.id } },
      body: {
        knowledgeBaseId: args.base,
        ...(args.version ? { version: args.version } : {}),
      },
      parseAs: "stream",
    });
    const saved = await unwrapEnvelope(response, noteSaveResultSchema.parse);
    return result(saved, { render: (data) => `已移动笔记 ${data.id} 到知识库 ${args.base}` });
  },
});

export const noteRemove = defineCommand({
  name: "note rm",
  summary: "删除笔记",
  endpoint: "DELETE /api/note/notes/{noteId}",
  mutating: true,
  args: z.object({ id: z.coerce.number().int().positive().describe("笔记 ID") }),
  positional: ["id"],
  examples: [{ cmd: "anynote note rm 2571 --yes" }],
  run: async (ctx, args) => {
    const { response } = await ctx.api.note.DELETE("/notes/{noteId}", {
      params: { path: { noteId: args.id } },
      parseAs: "stream",
    });
    await unwrapEnvelope(response, () => null);
    return result({ id: args.id, deleted: true }, { render: (data) => `已删除笔记 ${data.id}` });
  },
});
