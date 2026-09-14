import { CardGridSkeleton, PanelSkeleton } from "@/components/loading/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 协同文档库的加载态：左列表 + 右预览两栏（与 `DocLibrary` 的布局一致）。
 *
 * 窄屏下右栏本来就不显示，所以它跟列表一样用 `lg:block hidden` 的显隐规则。
 */
export default function DocsLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <CardGridSkeleton count={4} cardClassName="h-36" className="lg:grid-cols-2" />
        <PanelSkeleton className="hidden lg:block" />
      </div>
    </section>
  );
}
