import { ListRowsSkeleton } from "@/components/loading/skeletons";

/**
 * 笔记历史版本的加载态（D-16）。
 *
 * 与编辑器骨架分开：D-16 是「左正文 + 右 320 面板」的两栏，
 * 沿用编辑器的单列骨架会在加载完成时整页横向重排。
 */
export default function NoteHistoryLoading() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <ListRowsSkeleton count={4} />
      <ListRowsSkeleton count={5} />
    </div>
  );
}
