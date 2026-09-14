import { EditorSkeleton } from "@/components/loading/skeletons";

/**
 * 移动端笔记编辑器的加载态。
 *
 * 沉浸式路由（编辑器 / 对话）没有 tab bar，可用高度由 `--mobile-content-h` 决定，
 * 但骨架本身是文档流内容，不需要参与那个高度链——给对形状即可。
 */
export default function MobileNoteEditorLoading() {
  return (
    <div className="px-4 py-6">
      <EditorSkeleton paragraphs={6} />
    </div>
  );
}
