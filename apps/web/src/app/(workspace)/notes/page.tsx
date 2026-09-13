import { KnowledgeBaseGallery } from "@/features/notes/components/knowledge-base-gallery";

/**
 * `/notes`：知识库画廊。
 *
 * `?new=1` 直接把新建对话框打开——侧栏与卡片入口都用这个地址，
 * 于是"新建知识库"在整站只有一个 URL，不依赖任何客户端 query 解析。
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { new: isNew } = await searchParams;
  return <KnowledgeBaseGallery openCreate={isNew === "1"} />;
}
