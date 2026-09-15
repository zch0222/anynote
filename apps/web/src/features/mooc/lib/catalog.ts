import { MOOC_ITEM_TYPE, type MoocItem } from "../schemas";

/**
 * 目录里的一个条目 + 它所属的章节。
 *
 * `chapter` 为 `null` 表示条目直接挂在课程下（没有章节这一层）。
 * 「所在位置」那一行（D-06 图例 19）需要它——折叠目录后用户仍要知道自己在哪一章。
 */
export type CatalogNode = {
  item: MoocItem;
  chapter: MoocItem | null;
};

/** 按父级取条目；实现里注入 `queryClient.fetchQuery`，因此重复调用命中缓存。 */
export type MoocItemsLoader = (parentId: number) => Promise<MoocItem[]>;

/** 章节是容器不是内容：「下一节」和默认选中都只认视频与文档。 */
export function isPlayable(item: MoocItem): boolean {
  return item.moocItemType === MOOC_ITEM_TYPE.VIDEO || item.moocItemType === MOOC_ITEM_TYPE.DOC;
}

/**
 * 按目录顺序惰性遍历整棵目录。
 *
 * 用 async generator 而不是先摊平成数组，是为了让「取第一个视频」这类调用
 * **只展开走到的那几章**：一门课几十个章节时，先全部取完再取第 0 个
 * 会白白打出几十个请求。`await load(...)` 在生成器推进到该章时才执行。
 */
async function* iterateCatalog(load: MoocItemsLoader): AsyncGenerator<CatalogNode> {
  const top = await load(0);
  for (const item of top) {
    yield { item, chapter: null };
    if (item.moocItemType === MOOC_ITEM_TYPE.CHAPTER) {
      for (const child of await load(item.id)) {
        yield { item: child, chapter: item };
      }
    }
  }
}

/** 目录里的第一个视频 / 文档（D-06：进入页面默认选中它）。 */
export async function firstPlayable(load: MoocItemsLoader): Promise<CatalogNode | null> {
  for await (const node of iterateCatalog(load)) {
    if (isPlayable(node.item)) return node;
  }
  return null;
}

/**
 * 目录顺序上 `currentItemId` 的下一个视频 / 文档；已是最后一个时返回 `null`
 * （调用方据此隐藏「下一节」）。
 *
 * 当前条目是**章节**时返回它内部的第一个视频 / 文档——用户点了章节标题之后
 * 按「下一节」，期望的是进这一章，而不是跳到下一章。
 *
 * 找不到当前条目时同样返回 `null`：目录是服务端给的，前端记的 id 不在里面
 * 只可能是目录被改过，此时"没有下一节"比"跳到某处"更安全。
 */
export async function nextPlayable(
  load: MoocItemsLoader,
  currentItemId: number,
): Promise<CatalogNode | null> {
  let reached = false;
  for await (const node of iterateCatalog(load)) {
    if (node.item.id === currentItemId) {
      reached = true;
      continue;
    }
    if (reached && isPlayable(node.item)) return node;
  }
  return null;
}
