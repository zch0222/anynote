import useSWR from "swr";
import {getTaskCharts, getTaskManageNoteOperationCounts} from "@/requests/client/note/noteTask";

export default function useTaskCharts(noteTaskId: number) {

    return useSWR(`/api/note/noteTasks/${noteTaskId}/charts`, () => getTaskCharts({
        noteTaskId: noteTaskId
    }).then(res => res.data.data))
}
