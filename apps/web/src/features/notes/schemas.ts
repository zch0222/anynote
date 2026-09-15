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

/* ------------------------------------------------------------------ *
 * 笔记历史版本（D-16）。两个端点字段很少，只取画板用到的。
 * ------------------------------------------------------------------ */

/** 历史版本列表项（`GET /notes/historyList`）。 */
export const noteHistoryItemSchema = z.object({
  /** 列表与内容两端点的关联键：点一条版本拿它去请求 `GET /notes/history`。 */
  operationLogId: z.number(),
  operationTime: z.string().nullish(),
  updaterId: z.number().nullish(),
  updaterNickname: z.string().nullish(),
  updaterUsername: z.string().nullish(),
});
export type NoteHistoryItem = z.infer<typeof noteHistoryItemSchema>;

/**
 * 单个历史版本的内容（`GET /notes/history`）。
 *
 * `noteEditList` 是后端逐次编辑留下的原文 / 改后片段。本期「本次改动」
 * 按 `diffLines` 做**行级**比较（§1.4 第 4 条），所以只解析不渲染；
 * 留着它是为了下一期做行内词级高亮时不必再回来改 schema。
 */
export const noteHistoryDetailSchema = z.object({
  noteHistoryId: z.number().nullish(),
  noteId: z.number().nullish(),
  title: z.string().nullish(),
  content: z.string().nullish(),
  historyTime: z.string().nullish(),
  createBy: z.number().nullish(),
  noteEditList: z
    .array(
      z.object({
        editLogId: z.number().nullish(),
        originalText: z.string().nullish(),
        revisedText: z.string().nullish(),
        changeType: z.number().nullish(),
      }),
    )
    .nullish(),
});
export type NoteHistoryDetail = z.infer<typeof noteHistoryDetailSchema>;

/**
 * 版本行的显示名：昵称优先，没有昵称的账号（导入的常见）退回用户名。
 *
 * 参数写成 `?: string | null | undefined`：`exactOptionalPropertyTypes` 下
 * `z.string().nullish()` 推出来的是 `string | null | undefined`，而调用方传的是
 * 整个 `NoteHistoryItem`。别处沿用同一写法。
 */
export function historyUpdaterName(item: {
  updaterNickname?: string | null | undefined;
  updaterUsername?: string | null | undefined;
}): string {
  return item.updaterNickname?.trim() || item.updaterUsername?.trim() || "未知用户";
}
