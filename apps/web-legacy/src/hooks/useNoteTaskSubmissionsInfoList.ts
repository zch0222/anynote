import useSWR from 'swr';
import { getTaskSubmissionsInfoList } from "@/requests/client/note/noteTask";
import {SWRParams} from "@/types/paginationTypes";

export default function useNoteTaskSubmissionsInfoList({ params, page, pageSize }: SWRParams<{
    noteTaskId: number,
    userTaskStatus: number
}>) {
    return useSWR(`/api/note/admin/noteTasks/submissions?pageSize=${pageSize}&page=${page}&noteTaskId=${params.noteTaskId}&userTaskStatus=${params.userTaskStatus}`,
        () => getTaskSubmissionsInfoList({
            page: page,
            pageSize: pageSize,
            noteTaskId: params.noteTaskId,
            userTaskStatus: params.userTaskStatus
        }).then(res => res.data.data))
}
