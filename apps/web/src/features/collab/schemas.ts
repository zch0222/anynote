import { z } from "zod";

/** 协同文档标题。与 `collabDocMetaSchema.title` 同一区间，表单侧提供中文提示。 */
export const collabDocTitleSchema = z.object({
  title: z.string().trim().min(1, "请输入文档标题").max(60, "标题最多 60 个字符"),
});

export type CollabDocTitleInput = z.infer<typeof collabDocTitleSchema>;
