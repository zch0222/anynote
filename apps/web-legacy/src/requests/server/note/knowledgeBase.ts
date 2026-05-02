import request, {Method} from "@/utils/server-request"
import { NoteKnowledgeBaseDTO } from "@/types/noteTypes";
import {PageBean, ResData} from "@/types/requestTypes";

export const getKnowledgeBasesUrl = "/api/note/bases"
export function getKnowledgeBases(params: {
    page: number,
    pageSize: number
}) {
    return request<ResData<PageBean<NoteKnowledgeBaseDTO>>>({
        url: getKnowledgeBasesUrl,
        method: Method.GET,
        data: params,
        needToken: true
    })
}


export function getKnowledgeBaseById(params: {
    id: number
}) {
    return request<ResData<NoteKnowledgeBaseDTO>>({
        url: `/api/note/bases/${params.id}`,
        method: Method.GET,
        needToken: true
    })
}
