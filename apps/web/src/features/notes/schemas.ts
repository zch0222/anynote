import { z } from "zod";

/**
 * 数据层 schema（与 CLI 共用的部分）已迁入 `@anynote/api-core/note-schemas`，
 * 此处再导出以保持页面与 hook 的 import 路径不变；
 * 带中文校验文案的表单 schema 属于 UI 层，继续留在本文件。
 */
export {
  ALL_BASE_PERMISSIONS,
  DEFAULT_BASE_COVER,
  DEFAULT_PAGE_SIZE,
  type KnowledgeBase,
  knowledgeBaseSchema,
  type NoteDetail,
  noteDetailSchema,
  type NoteListItem,
  noteListItemSchema,
  type NoteSaveResult,
  noteSaveResultSchema,
  pageBeanSchema,
  toVersion,
} from "@anynote/api-core/note-schemas";

export type NoteListParams = {
  knowledgeBaseId: number;
  page: number;
  pageSize: number;
};

export const createBaseSchema = z.object({
  name: z.string().trim().min(1, "知识库名称不能为空").max(30, "知识库名称最多 30 个字符"),
  detail: z.string().trim().max(200, "简介最多 200 个字符"),
});
export type CreateBaseInput = z.infer<typeof createBaseSchema>;

// 后端 NoteCreateDTO 上是 @Size(max = 15, min = 3)，这里同步限制以免提交后才报错。
export const createNoteSchema = z.object({
  title: z.string().trim().min(3, "标题至少 3 个字符").max(15, "标题最多 15 个字符"),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
