import request, {Method} from "@/utils/client-request"
import { PageBean, ResData } from "@/types/requestTypes";
import {NoteKnowledgeBaseDTO} from "@/types/noteTypes";

export function getKnowledgeBaseList(params: {
    page: number,
    pageSize: number,
    type: number | undefined,
    status: number | undefined,
    organizationId: number | undefined
}) {
    return request<ResData<PageBean<NoteKnowledgeBaseDTO>>>({
        url: `/api/manage/bases`,
        params: params,
        method: Method.GET,
        needToken: true
    })
}