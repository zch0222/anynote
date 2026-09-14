import { PanelSkeleton } from "@/components/loading/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * AI 对话页的加载态：左侧会话列表 + 右侧消息区。
 *
 * 会话列表是**行**不是卡片（每条就是一行标题），所以这里不用 `ListRowsSkeleton`
 * 的卡片外壳，直接用更轻的裸行——列表栏本身已经有底色了。
 */
export default function AiChatLoading() {
  return (
    <section className="mx-auto flex w-full max-w-6xl gap-4">
      <aside className="hidden w-64 shrink-0 space-y-2 md:block">
        <Skeleton className="h-9 w-full rounded-full" />
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-10 rounded-lg" />
        ))}
      </aside>
      <div className="min-w-0 flex-1">
        <PanelSkeleton />
      </div>
    </section>
  );
}
