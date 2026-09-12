import { z } from "zod";

/**
 * 笔记 / 知识库的数据层 schema，由 `apps/web` 与 `apps/cli` 共用。
 *
 * 后端 `n_note` / `n_knowledge_base` 的 id 是 bigint，JSON 里是 number。
 * 这里只挑调用方真正用到的字段做校验，多余字段直接忽略，避免后端加字段就把前端打挂。
 *
 * 表单文案类 schema（带中文提示的 `createBaseSchema` 等）留在各自的 UI 层，不进本文件。
 */

/** 乐观并发版本号：由服务端 updateTime 派生，与后端 NoteVersionUtil 的口径一致。 */
export function toVersion(updateTime: string | null | undefined): string | null {
  if (!updateTime) return null;
  const parsed = Date.parse(updateTime);
  return Number.isNaN(parsed) ? null : String(parsed);
}

export const knowledgeBaseSchema = z.object({
  id: z.number(),
  knowledgeBaseName: z.string().nullish(),
  cover: z.string().nullish(),
  detail: z.string().nullish(),
  permissions: z.number().nullish(),
  updateTime: z.string().nullish(),
});
export type KnowledgeBase = z.infer<typeof knowledgeBaseSchema>;

export const noteListItemSchema = z.object({
  id: z.number(),
  title: z.string().nullish(),
  knowledgeBaseId: z.number().nullish(),
  knowledgeBaseName: z.string().nullish(),
  updateTime: z.string().nullish(),
  latestOperationTime: z.string().nullish(),
});
export type NoteListItem = z.infer<typeof noteListItemSchema>;

export const noteDetailSchema = z.object({
  id: z.number(),
  title: z.string().nullish(),
  content: z.string().nullish(),
  knowledgeBaseId: z.number().nullish(),
  knowledgeBaseName: z.string().nullish(),
  updateTime: z.string().nullish(),
});
export type NoteDetail = z.infer<typeof noteDetailSchema>;

export const noteSaveResultSchema = z.object({
  id: z.number(),
  title: z.string().nullish(),
  content: z.string().nullish(),
  updateTime: z.string().nullish(),
  version: z.string().nullish(),
});
export type NoteSaveResult = z.infer<typeof noteSaveResultSchema>;

/** 分页信封：rows 由调用方传入的 schema 逐条校验。 */
export function pageBeanSchema<T extends z.ZodTypeAny>(row: T) {
  return z.object({
    current: z.number().nullish(),
    pages: z.number().nullish(),
    total: z.number().nullish(),
    rows: z
      .array(row)
      .nullish()
      .transform((rows) => rows ?? []),
  });
}

export const DEFAULT_PAGE_SIZE = 20;

/** 知识库列表的权限过滤值：4 = 含「无权限」在内的全部，等价于「我能看到的所有知识库」。 */
export const ALL_BASE_PERMISSIONS = 4;

/** 新建知识库时后端要求 cover 非空；沿用 legacy 前端的默认封面。 */
export const DEFAULT_BASE_COVER =
  "https://anynote.obs.cn-east-3.myhuaweicloud.com/images/knowledge_base_cover.png";
