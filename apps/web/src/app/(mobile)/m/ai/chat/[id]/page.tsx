import { MobileChat } from "@/features/ai/components/mobile/chat-mobile";
import { positiveParam } from "@/lib/ai/citations";
import { notFound } from "next/navigation";

/** `new` 是新对话的保留 id：会话要等首条消息返回才有真实 id。 */
const NEW_CONVERSATION_SEGMENT = "new";

export default async function Page({
  params,
  searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ baseId?: string }> }) {
  const { id } = await params;
  if (id === NEW_CONVERSATION_SEGMENT)
    return <MobileChat initialBaseId={positiveParam((await searchParams).baseId) ?? undefined} />;
  const conversationId = Number(id);
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0) notFound();
  return <MobileChat conversationId={conversationId} />;
}
