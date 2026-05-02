import useSWR from "swr";
import { getNoteTaskList } from "@/requests/client/note/noteTask";

export default function useNoteTaskList({params, page, pageSize}: {
    params: {
        knowledgeBaseId: number
    },
    page: number,
    pageSize: number
}) {
    return useSWR(`/api/note/noteTasks?knowledgeBaseId=${params.knowledgeBaseId}&page=${page}&pageSize=${pageSize}`,
        () => getNoteTaskList({
            knowledgeBaseId: params.knowledgeBaseId,
            page: page,
            pageSize: pageSize
        }).then(res => res.data.data))
}
