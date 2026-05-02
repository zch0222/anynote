import useSWR from "swr";
import { searchNote } from "@/requests/client/note/note";
import { SWRParams } from "@/types/paginationTypes";

export default function useNoteSearchList({ params, page, pageSize }: SWRParams<{
    keyword: string
}>) {
    return useSWR(`/api/note/notes/search?keyword=${params.keyword}&page=${page}&pageSize=${pageSize}`,
        () => searchNote({
            keyword: params.keyword,
            page: page,
            pageSize: pageSize
        }).then(res => res.data.data))
}
