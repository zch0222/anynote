import useSWR from "swr";
import { getNoteById } from "@/requests/client/note/note";


export default function useNote({ id }: {
    id: number
}) {
    return useSWR(`/api/note/notes/${id}`, () => getNoteById({
        id: id
    }).then(res => res.data.data))
}
