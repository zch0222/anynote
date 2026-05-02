import useSWR from "swr";
import { getNoteList } from "@/requests/client/note/note";
import {SWRParams} from "@/types/paginationTypes";

export default function useNoteListV2({ params, page, pageSize }: SWRParams<{
    knowledgeBaseId: number,
}>) {
    return useSWR(`/api/note/notes?knowledgeBaseId=${params.knowledgeBaseId}&pageSize=${pageSize}&page=${page}`,
        () => getNoteList({
            page: page,
            pageSize: pageSize
        }).then(res => res.data.data))
}