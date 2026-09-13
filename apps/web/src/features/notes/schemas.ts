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

/**
 * 知识库成员（设计稿「成员」Tab）。
 *
 * `permissions` 是位权限，与 `KnowledgeBase.permissions` 同一套编码；
 * 成员名优先取昵称，没有昵称的用户（导入的账号常见）退回用户名。
 */
export const baseMemberSchema = z.object({
  userId: z.number(),
  username: z.string().nullish(),
  nickname: z.string().nullish(),
  permissions: z.number().nullish(),
});
export type KnowledgeBaseMember = z.infer<typeof baseMemberSchema>;

export function memberDisplayName(member: KnowledgeBaseMember): string {
  return member.nickname?.trim() || member.username?.trim() || "未命名成员";
}

/**
 * 知识库「资料」Tab 的文档行。
 *
 * `indexStatus` 是后端的索引状态位：只有已索引的文档才能被 RAG 问答检索到，
 * 所以列表上必须能看出来，否则用户会以为"传上去了却搜不到"。
 */
export const DOC_INDEXED = 1;

export const docListSchema = z.object({
  id: z.number(),
  docName: z.string().nullish(),
  knowledgeBaseId: z.number().nullish(),
  indexStatus: z.number().nullish(),
  creatorNickname: z.string().nullish(),
  creatorUsername: z.string().nullish(),
  createTime: z.string().nullish(),
  updateTime: z.string().nullish(),
});
export type DocListItem = z.infer<typeof docListSchema>;

/** 知识库画廊的分段筛选：全部 / 我的 / 组织。 */
export const baseScopes = ["all", "mine", "organization"] as const;
export type BaseScope = (typeof baseScopes)[number];

export const baseScopeOptions = [
  { value: "all", label: "全部" },
  { value: "mine", label: "我的" },
  { value: "organization", label: "组织" },
] as const satisfies readonly { value: BaseScope; label: string }[];

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
