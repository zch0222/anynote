import useSWR from "swr";
import { getKnowledgeBaseMemberList } from "@/requests/client/note/knowledgeBase";
import {SWRParams} from "@/types/paginationTypes";

export default function useKnowledgeBaseMemberList({params, page, pageSize}: SWRParams<{
    knowledgeBaseId: number,
    username: string
}>) {

    return useSWR(`/api/note/bases/users?knowledgeBaseId=${params.knowledgeBaseId}&pageSize=${pageSize}&page=${page}&username=${params.username}`,
        () => getKnowledgeBaseMemberList({
            page: page,
            pageSize: pageSize,
            ...params
        }).then(res => res.data.data))
}