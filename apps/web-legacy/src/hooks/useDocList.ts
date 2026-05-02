import useSWR from "swr";
import { getDocList } from "@/requests/client/note/doc";
import { SWRParams } from "@/types/paginationTypes";

export default function useDocList({ params, page, pageSize }: SWRParams<{
    knowledgeBaseId: number,
}>) {
    return useSWR(`/api/note/docs?knowledgeBaseId=${params.knowledgeBaseId}&pageSize=${pageSize}&page=${page}`,
        () => getDocList({
            page: page,
            pageSize: pageSize,
            ...params
        }).then(res => res.data.data))
}