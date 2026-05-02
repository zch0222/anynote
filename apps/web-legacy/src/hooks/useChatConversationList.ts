import useSWR from "swr";
import { getChatConversationList } from "@/requests/client/ai/chat";
import { SWRParams } from "@/types/paginationTypes";

export default function useChatConversationList({ params, page, pageSize }: SWRParams<{
    id?: number,
    docId?: number
}>) {
    let key: string = `/api/aiNio/chat/conversations?pageSize=${pageSize}&page=${page}`
    if (params.id) {
        key += `&id=${params.id}`
    }
    if (params.docId) {
        key += `&docId=${params.docId}`
    }
    return useSWR(key, () => getChatConversationList({
        page: page,
        pageSize: pageSize,
        ...params
    }).then(res => res.data.data))
}
