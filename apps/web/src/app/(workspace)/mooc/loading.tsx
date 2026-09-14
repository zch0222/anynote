import { CardGridSkeleton } from "@/components/loading/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** 慕课 Tab 的加载态：卡片网格（设计稿 P13 映射表「慕课 → 卡片网格」）。 */
export default function MoocLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-3.5 w-56" />
      </div>
      <CardGridSkeleton count={6} cardClassName="h-40" />
    </section>
  );
}
