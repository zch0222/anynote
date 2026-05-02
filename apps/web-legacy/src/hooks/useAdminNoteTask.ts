import useSWR from "swr";
import {getAdminNoteById} from "@/requests/client/note/noteTask";

export default function useAdminNoteTask(noteTaskId: number) {

    console.log("noteTaskId", noteTaskId)

    return useSWR(`/api/note/admin/noteTasks/${noteTaskId}`,
        () => getAdminNoteById({id: noteTaskId}).then(res => res.data.data))
}
