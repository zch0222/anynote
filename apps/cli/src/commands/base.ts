import {
  ALL_BASE_PERMISSIONS,
  DEFAULT_BASE_COVER,
  DEFAULT_PAGE_SIZE,
  knowledgeBaseSchema,
  pageBeanSchema,
  unwrapEnvelope,
} from "@anynote/api-core";
import { z } from "zod";
import { defineCommand, result } from "../core/command";
import type { CliContext } from "../core/context";

const basePageSchema = pageBeanSchema(knowledgeBaseSchema);
const createdSchema = z.object({ id: z.number() });

const LIST_FIELDS = ["id", "knowledgeBaseName", "permissions", "updateTime"];

async function fetchBase(ctx: CliContext, id: number) {
  const { response } = await ctx.api.note.GET("/bases/{id}", {
    params: { path: { id } },
    parseAs: "stream",
  });
  return unwrapEnvelope(response, knowledgeBaseSchema.parse);
}

export const baseList = defineCommand({
  name: "base list",
  summary: "分页列出当前用户可见的知识库",
  description:
    "permissions 是「小于等于」过滤，默认 4 表示我能看到的全部知识库。返回 id / 名称 / 权限 / 更新时间。",
  endpoint: "GET /api/note/bases",
  args: z.object({
    page: z.coerce.number().int().min(1).default(1).describe("页码，从 1 起"),
    limit: z.coerce.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE).describe("每页条数"),
    permissions: z.coerce
      .number()
      .int()
      .default(ALL_BASE_PERMISSIONS)
      .describe("权限过滤上界，默认 4 = 全部"),
  }),
  examples: [{ cmd: "anynote base list --json" }],
  run: async (ctx, args) => {
    const { response } = await ctx.api.note.GET("/bases", {
      params: { query: { page: args.page, pageSize: args.limit, permissions: args.permissions } },
      parseAs: "stream",
    });
    const page = await unwrapEnvelope(response, basePageSchema.parse);
    return result(
      page.rows.map((row) =>
        Object.fromEntries(LIST_FIELDS.map((field) => [field, row[field as keyof typeof row]])),
      ),
    );
  },
});

export const baseGet = defineCommand({
  name: "base get",
  summary: "按 ID 获取知识库详情",
  description:
    "注意：知识库的权限切面先于存在性检查执行，**不存在与无权限都返回 A0301（退出码 3）**，" +
    "不要据此判定需要重新登录；笔记侧则是正常的 A0404（退出码 6）。",
  endpoint: "GET /api/note/bases/{id}",
  args: z.object({ id: z.coerce.number().int().positive().describe("知识库 ID") }),
  positional: ["id"],
  examples: [{ cmd: "anynote base get 70" }],
  run: async (ctx, args) => result(await fetchBase(ctx, args.id)),
});

export const baseCreate = defineCommand({
  name: "base create",
  summary: "新建知识库",
  description:
    "后端要求 cover 非空且域名在白名单内，未指定时使用默认封面。name 长度 2-15，detail 最多 500。",
  endpoint: "POST /api/note/bases",
  mutating: true,
  args: z.object({
    name: z.string().trim().min(2).max(15).describe("知识库名称，2-15 字符"),
    detail: z.string().trim().max(500).default("").describe("简介"),
    cover: z.string().url().default(DEFAULT_BASE_COVER).describe("封面图 URL"),
    type: z.coerce.number().int().min(0).max(1).default(0).describe("类型：0 个人 / 1 组织"),
  }),
  examples: [{ cmd: 'anynote base create --name "我的知识库" --yes' }],
  run: async (ctx, args) => {
    const { response } = await ctx.api.note.POST("/bases", {
      body: { name: args.name, detail: args.detail, cover: args.cover, type: args.type },
      parseAs: "stream",
    });
    const created = await unwrapEnvelope(response, createdSchema.parse);
    return result(created, { render: (data) => String(data.id) });
  },
});

export const baseUpdate = defineCommand({
  name: "base update",
  summary: "修改知识库名称 / 简介 / 封面",
  description:
    "后端的 @Url 切面会读取请求体里的 cover，缺省会直接 NPE 成 B0001。未显式给 --cover 时，" +
    "本命令先读取知识库当前封面再回填。",
  endpoint: "PUT /api/note/bases/{id}",
  mutating: true,
  args: z.object({
    id: z.coerce.number().int().positive().describe("知识库 ID"),
    name: z.string().trim().min(2).max(15).optional().describe("新名称"),
    detail: z.string().trim().max(500).optional().describe("新简介"),
    cover: z.string().url().optional().describe("新封面 URL"),
  }),
  positional: ["id"],
  examples: [{ cmd: 'anynote base update 70 --name "新名字" --yes' }],
  run: async (ctx, args) => {
    const current = await fetchBase(ctx, args.id);
    const { response } = await ctx.api.note.PUT("/bases/{id}", {
      params: { path: { id: args.id } },
      body: {
        knowledgeBaseId: args.id,
        name: args.name ?? current.knowledgeBaseName ?? "",
        detail: args.detail ?? current.detail ?? "",
        // cover 不能为 null：后端切面拿它做 URL 白名单校验
        cover: args.cover ?? current.cover ?? DEFAULT_BASE_COVER,
      },
      parseAs: "stream",
    });
    await unwrapEnvelope(response, () => null);
    return result(await fetchBase(ctx, args.id));
  },
});

export const baseRemove = defineCommand({
  name: "base rm",
  summary: "删除知识库",
  description:
    "只有创建者能删除；非创建者会得到 B0001「没有权限删除知识库」。" +
    "知识库不存在时后端返回 A0301（退出码 3），而不是 A0404。",
  endpoint: "DELETE /api/note/bases/{id}",
  mutating: true,
  args: z.object({ id: z.coerce.number().int().positive().describe("知识库 ID") }),
  positional: ["id"],
  examples: [{ cmd: "anynote base rm 70 --yes" }],
  run: async (ctx, args) => {
    const { response } = await ctx.api.note.DELETE("/bases/{id}", {
      params: { path: { id: args.id } },
      parseAs: "stream",
    });
    await unwrapEnvelope(response, () => null);
    return result({ id: args.id, deleted: true }, { render: (data) => `已删除知识库 ${data.id}` });
  },
});
