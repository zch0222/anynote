import { EditorSkeleton } from "@/components/loading/skeletons";

/**
 * 笔记编辑器的加载态。
 *
 * 结构与 `NoteEditor` 的纸面一致：外层带同样的 `max-w` 与内边距、正文列同样限宽
 * （设计稿实测 1000px + 左右各 72px）。对不上的话，加载完成的一瞬间
 * 标题会横向跳一下 —— 那是编辑器页最刺眼的一种抖动。
 *
 * 这里**不套 `rounded-lg bg-surface shadow-card`**：编辑页是满幅页面（见 `isFullBleedRoute`），
 * 正文直接铺在内容底色上，加一张卡片就等于把设计稿否掉。
 */
export default function NoteEditorLoading() {
  return (
    <div className="mx-auto w-full max-w-[calc(62.5rem+9rem)] px-6 py-10 sm:px-8 lg:px-18">
      <EditorSkeleton paragraphs={7} />
    </div>
  );
}
