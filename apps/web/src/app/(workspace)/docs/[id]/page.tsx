import { CollabDocWorkspace } from "@/features/collab/components/collab-loader";
import { isCollabDocId } from "@/lib/collab/rooms";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 非法 id 在服务端就挡掉：它会被直接拼成协同房间名，不该带着去连服务
  if (!isCollabDocId(id)) notFound();
  return <CollabDocWorkspace docId={id} />;
}
