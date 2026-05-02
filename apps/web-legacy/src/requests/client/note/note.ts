import request, {Method} from "@/utils/client-request"
import {
    NoteInfo,
    Note,
    MarkdownImage,
    NoteHistoryListItemVO,
    NoteHistory,
    NoteSearchHighlight, NoteSearchSource
} from "@/types/noteTypes";
import {PageBean, ResData, SearchVO} from "@/types/requestTypes";
import {Simulate} from "react-dom/test-utils";



export function getNoteInfoList(params: {
    knowledgeBaseId: number,
    page: number,
    pageSize: number
}){
    return request<ResData<PageBean<NoteInfo>>>({
        url: `/api/note/notes/bases/${params.knowledgeBaseId}`,
        method: Method.POST,
        data: {page: params.page, pageSize: params.pageSize},
        needToken: true
    })
}


export function getNoteById(params: {
    id: number
}) {
    return request<ResData<Note>>({
        url: `/api/note/notes/${params.id}`,
        method: Method.GET,
        needToken: true
    })
}

export function deleteNote(params: {
    id: number
}) {
    return request<ResData<string>>({
        url: `/api/note/notes/${params.id}`,
        method: Method.DELETE,
        needToken: true
    })
}

export function updateNote(params: {
    id: number,
    title?: string,
    content: string
}) {
    const { id, title, content } = params
    return request({
        url: `/api/note/notes/${id}`,
        method: Method.PATCH,
        data: {
          title: title,
          content: content
        },
        needToken: true
    })
}

export function uploadNoteImage(params: {
    image: File,
    noteId: number,
    uploadId: string
}) {
    const formData = new FormData()
    formData.append("image", params.image)
    formData.append("noteId", params.noteId.toString())
    formData.append("updateId", params.uploadId)

    return request<ResData<MarkdownImage>>({
        url: "/api/note/notes/images",
        method: Method.POST,
        data: formData,
        needToken: true
    })
}

export function createNote(params: {
    title: string,
    knowledgeBaseId: number
}) {
    return request<ResData<number>>({
        url: "/api/note/notes",
        data: params,
        method: Method.POST,
        needToken: true
    })
}

export function getNoteHistoryList(params: {
    noteId: number,
    page: number,
    pageSize: number
}) {
    return request<ResData<PageBean<NoteHistoryListItemVO>>>({
        url: "/api/note/notes/historyList",
        method: Method.GET,
        params: params,
        needToken: true
    })
}

export function getNoteHistory(params: {
    operationId: number
}) {
    return request<ResData<NoteHistory>>({
        url: '/api/note/notes/history',
        method: Method.GET,
        needToken: true,
        params: params
    })
}

export function searchNote(params: {
    keyword: string,
    page: number,
    pageSize: number
}) {
    return request<ResData<PageBean<SearchVO<NoteSearchHighlight, NoteSearchSource>>>>({
        url: "/api/note/notes/search",
        method: Method.GET,
        needToken: true,
        params: params
    })
}

export function getNoteList(params: {
    page: number,
    pageSize: number
}) {
    return request<ResData<PageBean<NoteInfo>>>({
        url: `/api/note/notes`,
        method: Method.GET,
        needToken: true,
        params: params
    })
}
