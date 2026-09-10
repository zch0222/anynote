import { pageBeanSchema } from "@/features/ai/schemas";
import { z } from "zod";

/** 慕课列表行（note 域 /moocs，MoocListVO 白名单）。 */
export const moocSchema = z.object({
  id: z.number(),
  title: z.string().nullish(),
  moocDescription: z.string().nullish(),
  knowledgeBaseId: z.number().nullish(),
  moocPermission: z.number().nullish(),
  userPermission: z.number().nullish(),
  updateTime: z.string().nullish(),
});
export type Mooc = z.infer<typeof moocSchema>;

/** 课程条目（MoocItemListVO）：moocItemType 0 章节 / 1 视频 / 2 文档。 */
export const moocItemSchema = z.object({
  id: z.number(),
  title: z.string().nullish(),
  moocItemType: z.number().nullish(),
  objectName: z.string().nullish(),
  parentId: z.number().nullish(),
  updateTime: z.string().nullish(),
});
export type MoocItem = z.infer<typeof moocItemSchema>;

/** 条目详情（MoocItemVO）：文档类条目带 moocItemText。 */
export const moocItemDetailSchema = moocItemSchema.extend({
  moocItemText: z
    .object({
      content: z.string().nullish(),
    })
    .nullish(),
});
export type MoocItemDetail = z.infer<typeof moocItemDetailSchema>;

/** 条目类型常量（与后端 MoocItemType 枚举一致）。 */
export const MOOC_ITEM_TYPE = { CHAPTER: 0, VIDEO: 1, DOC: 2 } as const;

export function moocItemTypeName(type: number | null | undefined): string {
  if (type === MOOC_ITEM_TYPE.VIDEO) return "视频";
  if (type === MOOC_ITEM_TYPE.DOC) return "文档";
  return "章节";
}

/** file 域 byObjectName 换取的临时播放地址。 */
export const objectUrlSchema = z.object({
  url: z.string().nullish(),
  expireTime: z.string().nullish(),
});
export type ObjectUrl = z.infer<typeof objectUrlSchema>;

export const moocPageSchema = pageBeanSchema(moocSchema);
export const moocItemPageSchema = pageBeanSchema(moocItemSchema);
