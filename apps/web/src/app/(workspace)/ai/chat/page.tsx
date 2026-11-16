import { ChatPage } from "@/features/ai/components/chat-page";
import { positiveParam } from "@/lib/ai/citations";

/**
 * 读取知识库问答入口的预选范围。
 *
 * @author 称霸幼儿园
 */
export default async function Page({
  searchParams,
}: { searchParams: Promise<{ baseId?: string }> }) {
  const params = await searchParams;
  return <ChatPage initialBaseId={positiveParam(params.baseId) ?? undefined} />;
}
