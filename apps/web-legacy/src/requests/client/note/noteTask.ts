import request, {Method} from "@/utils/client-request"
import {PageBean, ResData} from "@/types/requestTypes";
import {AdminNoteTask, NoteTaskSubmissionInfo, NoteTask, NoteOperationCount} from "@/types/noteTypes";

export const getAdminNoteTaskListUrl = "/api/note/admin/noteTasks"

export function getAdminNoteTaskList(params: {
    knowledgeBaseId: number,
    page: number,
    pageSize: number
}) {
    return request<ResData<PageBean<AdminNoteTask>>>({
        url: getAdminNoteTaskListUrl,
        method: Method.GET,
        params: params,
        needToken: true
    })
}
export function getNoteTaskList(params: {
    knowledgeBaseId: number,
    page: number,
    pageSize: number
}) {
    return request<ResData<PageBean<NoteTask>>>({
        url: `/api/note/noteTasks`,
        method: Method.GET,
        params: params,
        needToken: true
    })
}


export function getAdminNoteById(params: {
    id: number
}) {
    return request<ResData<AdminNoteTask>>({
        url: `/api/note/admin/noteTasks/${params.id}`,
        method: Method.GET,
        needToken: true
    })
}


export function getTaskSubmissionsInfoList(params: {
    noteTaskId: number,
    page: number,
    pageSize: number,
    userTaskStatus: number
}) {
    return request<ResData<PageBean<NoteTaskSubmissionInfo>>>({
        url: '/api/note/admin/noteTasks/submissions',
        method: Method.GET,
        needToken: true,
        params: params
    })
}


export function createTask(params: {
    taskName: string,
    startTime: string,
    endTime: string,
    knowledgeBaseId: number,
    taskDescribe: string
}) {
    return request<ResData<String>>({
        url: `/api/note/admin/noteTasks`,
        method: Method.POST,
        needToken: true,
        data: params
    })
}

export function getTaskManageNoteOperationCounts(params: {
    noteTaskId: number
}) {
    return request<ResData<NoteOperationCount[]>>({
        url: `/api/note/admin/noteTasks/${params.noteTaskId}/operationCounts`,
        method: Method.GET,
        needToken: true
    })
}

export function getTaskCharts(params: {
    noteTaskId: number
}) {
    return request<ResData<NoteOperationCount[]>>({
        url: `/api/note/noteTasks/${params.noteTaskId}/charts`,
        method: Method.GET,
        needToken: true
    })
}

export function returnTaskSubmission(id: number) {
    return request<ResData<string>>({
        url: `/api/note/admin/noteTasks/submissions/return/${id}`,
        method: Method.POST,
        needToken: true
    })
}

export function editTask(params: {
    id: number,
    taskName: string,
    startTime: string,
    endTime: string,
    taskDescribe: string
}) {
    return request<ResData<string>>({
        url: `/api/note/admin/noteTasks/${params.id}`,
        method: Method.PATCH,
        needToken: true,
        data: params
    })
}

export function submitTask(params: {
    noteTaskId: number,
    noteId: number
}) {
    return  request<ResData<string>>({
        url: `/api/note/noteTasks/submit`,
        method: Method.POST,
        needToken: true,
        data: params
    })
}




