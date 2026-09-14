import { EditorSkeleton } from "@/components/loading/skeletons";

/**
 * 协作文档编辑页的加载态。
 *
 * 与 `note-editor` 同款编辑器骨架：`/docs/[id]` 的落地形态就是一篇可编辑的文档，
 * 形状给对了，yjs 连上之后的替换是无感的。
 */
export default function DocWorkspaceLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <EditorSkeleton paragraphs={6} />
    </div>
  );
}
