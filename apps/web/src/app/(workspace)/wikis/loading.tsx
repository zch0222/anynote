import { EditorSkeleton } from "@/components/loading/skeletons";

/**
 * Wikis 阅读页的加载态：文章（标题 + 段落）。
 *
 * 设计稿 P13 映射表把「PDF → 文档页」单列一类，Wikis 这类**只读长文**
 * 与编辑器同形，都是"标题 + 一段段正文"，所以复用编辑器骨架。
 */
export default function WikisLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <EditorSkeleton paragraphs={6} />
    </div>
  );
}
