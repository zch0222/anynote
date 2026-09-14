import { DocumentSkeleton } from "@/components/loading/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** PDF 问答页的加载态：左文档列表 + 中预览（文档页）+ 右问答。 */
export default function AiPdfLoading() {
  return (
    <section className="mx-auto flex w-full max-w-7xl gap-4">
      <aside className="hidden w-64 shrink-0 space-y-2 lg:block">
        <Skeleton className="h-9 w-full rounded-full" />
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-12 rounded-lg" />
        ))}
      </aside>
      <div className="min-w-0 flex-1">
        <DocumentSkeleton />
      </div>
    </section>
  );
}
