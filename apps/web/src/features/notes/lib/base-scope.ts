import type { BaseScope, KnowledgeBase } from "@/features/notes/schemas";

export type BaseScopeSource = {
  /** `/bases`：我参与的普通知识库。 */
  mine: readonly KnowledgeBase[];
  /** `/bases/managerList`：我管理的普通知识库。 */
  managed: readonly KnowledgeBase[];
  /** `/bases/organizations`：我所属组织的组织知识库。 */
  organization: readonly KnowledgeBase[];
};

/**
 * 知识库列表的分段筛选（桌面画廊与移动端 `/m/notes` 共用）。
 *
 * 三个分段对应**三个不同口径的后端查询**，不是同一份数据的本地切片：
 * 普通知识库与组织知识库在 `n_knowledge_base.type` 上就是两棵树，
 * 所以「全部」= 普通 ∪ 组织，而不是"不过滤"。
 *
 * 去重按 id：组织库也可能出现在「我管理的」里（我是该库管理员又是组织成员），
 * 同一张卡不能出现两次。
 *
 * **单独成文件而不是留在 `knowledge-base-gallery.tsx`**：那份文件顶层引了
 * 整个桌面画廊组件树，移动端只为一个纯函数 import 它，会把画廊与它的依赖
 * 一起打进 `/m/notes` 的首屏（实测多出约 6 KB gzip，而 `/m/*` 的预算只有
 * 250KB）。纯函数放这里，两边都 import 它，真相仍然只有一份。
 */
export function selectBases(scope: BaseScope, source: BaseScopeSource): KnowledgeBase[] {
  const pools =
    scope === "all"
      ? [source.mine, source.organization]
      : scope === "mine"
        ? [source.managed]
        : [source.organization];
  const seen = new Set<number>();
  const result: KnowledgeBase[] = [];
  for (const pool of pools) {
    for (const base of pool) {
      if (seen.has(base.id)) continue;
      seen.add(base.id);
      result.push(base);
    }
  }
  return result;
}
