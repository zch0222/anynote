import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 知识库「笔记」Tab 的加载态：行列表。
 *
 * 设计稿 P13 的映射表把「笔记列表 → 行 + 缩略图」单列一类：
 * 它是列表不是卡片网格，骨架必须也是行，否则加载完成时一屏能看的条数会突变。
 */
export default function NotesBaseLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3.5 w-56" />
        </div>
        {/* 页头主按钮位：按钮尺寸已知，给一个同尺寸的胶囊 */}
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
      <ListRowsSkeleton />
    </div>
  );
}
