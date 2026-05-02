import useSWR from "swr";
import { getNoteHistoryList } from "@/requests/client/note/note";
import { SWRParams } from "@/types/paginationTypes";

export default function useNoteHistoryList({ params, page, pageSize }: SWRParams<{
    noteId: number
}>) {
    return useSWR(`/api/note/notes/historyList?noteId=${params.noteId}&page=${page}&pageSize=${pageSize}`,
        () => getNoteHistoryList({
            noteId: params.noteId,
            page: page,
            pageSize: pageSize
        }).then(res => res.data.data))
}

