import useSWR from "swr";
import { getKnowledgeBases } from "@/requests/client/note/knowledgeBase";
import { SWRParams } from "@/types/paginationTypes";

export default function useNoteKnowledgeBaseList({params, page, pageSize}: SWRParams<{
    type?: number | undefined,
    status?: number | undefined,
    organizationId?: number | undefined,
    permissions: number
}>) {

    return useSWR({
        url: `/api/note/bases?page=${page}&pageSize=${pageSize}&permissions=${params.permissions}`,
        params: params
    }, () => getKnowledgeBases({
        page: page,
        pageSize: pageSize,
        ...params
    }).then(res => res.data.data))
}
