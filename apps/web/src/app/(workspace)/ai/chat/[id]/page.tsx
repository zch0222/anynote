import { ChatPage } from "@/features/ai/components/chat-page";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0) {
    notFound();
  }
  return <ChatPage conversationId={conversationId} />;
}
