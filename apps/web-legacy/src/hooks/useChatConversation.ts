import useSWR from "swr";
import { getConversationById } from "@/requests/client/ai/chat";

export default function useChatConversation(id: number | null) {
    return useSWR(id && id !== 0 ? `/api/ai/chat/conversations/${id}` : null, () => getConversationById({
        // @ts-ignore
        id: id
    }).then(res => res.data.data))
}