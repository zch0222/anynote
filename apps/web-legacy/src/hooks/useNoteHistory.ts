import useSWR from "swr";

import { getNoteHistory } from "@/requests/client/note/note";

export default function useNoteHistory(params: {
    operationId: number
}) {
    return useSWR(`/api/note/notes/history?operationId=${params.operationId}`, () => getNoteHistory({
        operationId: params.operationId
    }).then(res => res.data.data))
}
