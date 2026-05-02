import useSWR from "swr";
import { getDocById } from "@/requests/client/note/doc";


export default function useDoc(docId: number | undefined) {

    return useSWR( docId ? `/api/note/docs/public/${docId}` : null, () => getDocById({
        // @ts-ignore
        docId: docId
    }).then(res => res.data.data))
}