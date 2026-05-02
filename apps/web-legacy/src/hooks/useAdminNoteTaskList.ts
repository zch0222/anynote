import useSWR from "swr";
import { getAdminNoteTaskList } from "@/requests/client/note/noteTask";
import { SWRParams } from "@/types/paginationTypes";

export default function useAdminNoteTaskList({ params, page, pageSize }: SWRParams<{
    knowledgeBaseId: number
}>) {
    return useSWR(`/api/note/admin/noteTasks?knowledgeBaseId=${params.knowledgeBaseId}&page=${page}&pageSize=${pageSize}`,
        () => getAdminNoteTaskList({
            knowledgeBaseId: params.knowledgeBaseId,
            pageSize: pageSize,
            page: page
        }).then(res => res.data.data))
}