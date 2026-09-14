import { TableSkeleton } from "@/components/loading/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** 任务 Tab / 跨库任务的加载态：表格行（设计稿 P13 映射表「任务 → 表格行」）。 */
export default function TasksLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-3.5 w-64" />
      </div>
      <TableSkeleton />
    </section>
  );
}
