import { isCollabDocId } from "@/lib/collab/rooms";
import * as Y from "yjs";
import { z } from "zod";

/**
 * 协同文档库的索引。它自己也是一个 Yjs 房间（`index`），因此「有哪些文档」
 * 同样是实时协同的：一个人新建，其他人的列表立刻出现这条，不需要后端表。
 */
export const COLLAB_INDEX_KEY = "documents";

export const collabDocMetaSchema = z.object({
  id: z.string().refine(isCollabDocId, "文档 id 不符合房间名契约"),
  title: z.string().min(1).max(60),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  createdBy: z.string().min(1),
});

export type CollabDocMeta = z.infer<typeof collabDocMetaSchema>;

function entries(doc: Y.Doc) {
  return doc.getArray<Y.Map<unknown>>(COLLAB_INDEX_KEY);
}

function findIndex(doc: Y.Doc, id: string): number {
  const list = entries(doc);
  for (let index = 0; index < list.length; index += 1) {
    if (list.get(index)?.get("id") === id) return index;
  }
  return -1;
}

/**
 * 读出索引里的文档列表，按更新时间倒序。
 *
 * 结构不合法的条目直接跳过而不是抛错：索引是多端可写的共享状态，
 * 一条脏数据不该让整个文档库打不开。
 */
export function readDocIndex(doc: Y.Doc): CollabDocMeta[] {
  const list: CollabDocMeta[] = [];
  for (const item of entries(doc)) {
    const parsed = collabDocMetaSchema.safeParse(item.toJSON());
    if (parsed.success) list.push(parsed.data);
  }
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 追加一条文档记录；id 重复时是空操作（两端同时新建同一 id 才可能发生）。 */
export function appendDocEntry(doc: Y.Doc, meta: CollabDocMeta): void {
  if (findIndex(doc, meta.id) !== -1) return;
  const entry = new Y.Map<unknown>();
  // 先塞满再入列表：半成品条目被其他端读到会被 schema 判为脏数据过滤掉。
  for (const [key, value] of Object.entries(meta)) entry.set(key, value);
  entries(doc).push([entry]);
}

/** 改标题并顺带更新 updatedAt。文档不存在时返回 false。 */
export function renameDocEntry(doc: Y.Doc, id: string, title: string, at = Date.now()): boolean {
  const index = findIndex(doc, id);
  const entry = index === -1 ? undefined : entries(doc).get(index);
  if (!entry) return false;
  entry.set("title", title);
  entry.set("updatedAt", at);
  return true;
}

/** 内容有改动时刷新 updatedAt，让列表排序反映真实活跃度。 */
export function touchDocEntry(doc: Y.Doc, id: string, at = Date.now()): boolean {
  const index = findIndex(doc, id);
  const entry = index === -1 ? undefined : entries(doc).get(index);
  if (!entry) return false;
  entry.set("updatedAt", at);
  return true;
}

/**
 * 从索引里移除一条。注意这只是让文档从列表上消失，
 * `doc:<id>` 房间的正文仍留在协同服务的持久化目录里（后端无回收端点）。
 */
export function removeDocEntry(doc: Y.Doc, id: string): boolean {
  const index = findIndex(doc, id);
  if (index === -1) return false;
  entries(doc).delete(index, 1);
  return true;
}
