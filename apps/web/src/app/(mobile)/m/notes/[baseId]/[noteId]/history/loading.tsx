import { ListRowsSkeleton } from "@/components/loading/skeletons";

/**
 * 笔记历史版本的加载态（M-13）。
 *
 * 必须单独放一份：它是 `[noteId]/loading.tsx`（编辑器骨架）的**子路由**，
 * 不覆盖的话打开历史会先看到一路标题 + 段落的编辑器骨架，
 * 而真实内容是"头像 + 名字 + 时间"的列表——加载完成时整屏重排。
 */
export default function MobileNoteHistoryLoading() {
  return (
    <div className="px-4 py-6">
      <ListRowsSkeleton count={6} />
    </div>
  );
}
