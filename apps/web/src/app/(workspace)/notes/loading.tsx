import { CardGridSkeleton } from "@/components/loading/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 知识库画廊的加载态：卡片网格。
 *
 * 形状必须与 `KnowledgeBaseGallery` 的网格**同断点、同列数**（`sm:2 lg:3`），
 * 否则加载完成时列数会跳一次，用户会觉得"页面重排了"。
 * 页头同样给出：Display 标题 + 一行副标题。
 */
export default function NotesLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-4 w-40" />
      </div>
      <CardGridSkeleton />
    </section>
  );
}
