import { PanelSkeleton } from "@/components/loading/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * AI 对话页加载态，匹配会话栏、对话页头与消息区布局。
 *
 * @author 称霸幼儿园
 */
export default function AiChatLoading() {
  return (
    <section className="flex min-h-0 flex-1 bg-surface">
      <aside className="hidden w-72 shrink-0 border-r border-separator bg-sidebar md:block">
        <div className="flex h-14 items-center justify-between border-b border-separator px-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="size-8 rounded-full" />
        </div>
        <div className="space-y-2 p-3">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-9 rounded-lg" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center border-b border-separator px-6">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="min-h-0 flex-1 p-6">
          <PanelSkeleton />
        </div>
      </div>
    </section>
  );
}
