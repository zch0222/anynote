import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 移动端知识库列表的加载态。
 *
 * 与桌面同款行骨架（`ListRowsSkeleton`）——移动端的库列表在设计稿里也是
 * 大标题 + 单列卡片，两端共用同一套形状，避免各写一份后漂移。
 */
export default function MobileNotesLoading() {
  return (
    <div className="space-y-4 px-4 py-4">
      <Skeleton className="h-8 w-28" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <ListRowsSkeleton count={4} />
    </div>
  );
}
