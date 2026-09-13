import { CreateNotePage } from "@/features/notes/components/create-note-page";

/**
 * `/notes/new`：跨知识库的新建笔记页。
 *
 * `?baseId=` 由**服务端**读出来并预选归属库——移动端从某个库里点「+」就是这个
 * 地址（`/m/notes/new?baseId=3` 会以桌面壳打开；移动端自己的新建页在
 * `(mobile)` 路由段下）。预选之后用户不必再从列表里挑一次。
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ baseId?: string }>;
}) {
  const { baseId } = await searchParams;
  const id = Number(baseId);
  const initialBaseId = Number.isSafeInteger(id) && id > 0 ? id : undefined;
  return <CreateNotePage initialBaseId={initialBaseId} />;
}
