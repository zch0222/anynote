import { KnowledgeBaseOverviewSkeleton } from "@/components/loading/skeletons";

/**
 * 知识库概览（D-02）的加载态。
 *
 * 必须有这个文件：Next 的 `loading.tsx` 按**路由段**就近查找，
 * `[baseId]/loading.tsx` 是笔记 Tab 的行骨架，概览段没有自己的就会继承它。
 * 而概览的宿主是「头图卡片 + 5 格计数 + 三块预览」——用行骨架的话，
 * 数据到达时整页会从"一列行"换成"卡片 + 网格"，是一次结构突变而不是填充。
 *
 * 图例 26 的要求是「封面 + 标题 + 两行文本 + 5 格计数，与真实版式同高」，
 * 已经落成 `KnowledgeBaseOverviewSkeleton`（尺寸逐项对齐画板实测值）。
 *
 * 放在 `overview/` 而不是 `[baseId]/`：后者是笔记 Tab 专属，
 * 概览 / 资料 / 成员各有各的形状，段级就近覆盖才对。
 */
export default function KnowledgeBaseOverviewLoading() {
  return <KnowledgeBaseOverviewSkeleton />;
}
