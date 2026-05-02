import useSWR from "swr";
import { getNoteInfoList } from "@/requests/client/note/note";
// import {  }

export default function useNoteList({params, page, pageSize}: {
    params: {
        knowledgeBaseId: number
    },
    page: number,
    pageSize: number
}) {
    return useSWR({
        url: `/api/note/notes/bases/${params.knowledgeBaseId}`,
        page: page,
        pageSize: pageSize
    }, () => getNoteInfoList({
        knowledgeBaseId: params.knowledgeBaseId,
        page: page,
        pageSize: pageSize
    }).then(res => res.data.data))
}
