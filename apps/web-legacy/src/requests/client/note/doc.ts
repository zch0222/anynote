import request, {Method, streamRequest} from "@/utils/client-request"
import { HuaweiOBSTemporarySignature } from "@/types/fileTypes";
import {PageBean, ResData} from "@/types/requestTypes";
import {CreateDTO, DocListVO, DocVO} from "@/types/noteTypes";
import {AxiosProgressEvent, GenericAbortSignal} from "axios";
import {EventSourceMessage} from "@microsoft/fetch-event-source";


export function docUploadTempLink(params: {
    fileName: string,
    contentType: string,
    knowledgeBaseId: number
}) {
    return request<ResData<HuaweiOBSTemporarySignature>>({
        url: "/api/note/docs/upload",
        method: Method.POST,
        data: params,
        needToken: true
    })
}

export function completeDocUpload(params: {
    docName: string,
    hash: string,
    knowledgeBaseId: number,
    uploadId: string
}) {
    return request<ResData<CreateDTO>>({
        url: "/api/note/docs/upload",
        method: Method.PUT,
        data: params,
        needToken: true
    })
}

export function getDocList(params: {
    knowledgeBaseId: number,
    page: number,
    pageSize: number
}) {
    return request<ResData<PageBean<DocListVO>>>({
        url: "/api/note/docs",
        method: Method.GET,
        params: params,
        needToken: true
    })
}

export function getDocById(params: {
    docId: number
}) {
    return request<ResData<DocVO>>({
        url: `/api/note/docs/public/${params.docId}`,
        method: Method.GET,
        needToken: true
    })
}

export function chatCompletions(params: {
    prompt: string,
    conversationId: number | null,
    model: string,
    onmessage: (event: EventSourceMessage) => void,
    onerror: (event: ErrorEvent) => void,
    signal?: GenericAbortSignal
}) {
    return streamRequest<void>({
        url: `/api/aiNio/chat/completions`,
        data: {
            prompt: params.prompt,
            conversationId: params.conversationId,
            model: params.model
        },
        method: Method.POST,
        needToken: true,
        onmessage: params.onmessage,
        onerror: params.onerror
    })
}

export function query(params: {
    docId: number,
    prompt: string,
    conversationId: number | null,
    onmessage: (event: EventSourceMessage) => void,
    onerror: (event: ErrorEvent) => void,
    signal?: GenericAbortSignal
}) {

    return streamRequest<void>({
        url: `/api/ai/rag/query/docs/v2`,
        data: {
            prompt: params.prompt,
            docId: params.docId,
            conversationId: params.conversationId
        },
        method: Method.POST,
        needToken: true,
        onmessage: params.onmessage,
        onerror: params.onerror
    })

}

export function freeDocQuery(params: {
    docId: number,
    prompt: string,
    conversationId: number | null,
    onmessage: (event: EventSourceMessage) => void,
    onerror: (event: ErrorEvent) => void,
    signal?: GenericAbortSignal
}) {
    return streamRequest<void>({
        url: `/api/ai/rag/public/query/docs`,
        data: {
            prompt: params.prompt,
            docId: params.docId,
            conversationId: params.conversationId
        },
        method: Method.POST,
        needToken: false,
        onmessage: params.onmessage,
        onerror: params.onerror
    })
}

export function indexDoc(id: number) {
    return request<ResData<string>>({
        url: `/api/note/docs/${id}/index`,
        method: Method.POST,
        needToken: true
    })
}

export function deleteDoc(id: number) {
    return request<ResData<string>>({
        url: `/api/note/docs/${id}`,
        method: Method.DELETE,
        needToken: true
    })
}

export function getHomeDoc() {
    return request<ResData<DocVO>>({
        url: `/api/note/docs/home`,
        method: Method.GET,
        needToken: false
    })
}
