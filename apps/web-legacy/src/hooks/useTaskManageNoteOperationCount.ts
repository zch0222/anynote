import useSWR from "swr";
import { getTaskManageNoteOperationCounts } from "@/requests/client/note/noteTask";

export default function useTaskManageNoteOperationCount(noteTaskId: number) {

    return useSWR(`/api/note/admin/noteTasks/${noteTaskId}/operationCounts`, () => getTaskManageNoteOperationCounts({
        noteTaskId: noteTaskId
    }).then(res => res.data.data))
}
