import {OssSliceUploadTaskCreateDTO, OssSliceUploadTaskVO} from "@/types/fileTypes";
import request, {Method} from "@/utils/client-request"
import {PageBean, ResData} from "@/types/requestTypes";
import {MoocInfo, MoocItem} from "@/types/moocTypes";

export function getMoocInfoById(params: {
    id: number
}){
    return request<ResData<MoocInfo>>({
        url: `/api/note/moocs/${params.id}`,
        method: Method.GET,
        needToken: true
    })
}

export function getMoocList(params: {
    knowledgeId: number,
    page: number,
    pageSize: number
}) {
    return request<ResData<PageBean<MoocInfo>>>({
        url: `/api/note/moocs`,
        method: Method.GET,
        needToken: true,
        params: params
    })
}

export function createMoocCoverUploadTask(createDTO: OssSliceUploadTaskCreateDTO) {
    return request<ResData<OssSliceUploadTaskVO>>({
        url: "/api/note/moocs/cover/create",
        method: Method.POST,
        data: createDTO,
        needToken: true
    })
}

export function createMoocVidoUploadTask(createDTO: OssSliceUploadTaskCreateDTO) {
    return request<ResData<OssSliceUploadTaskVO>>({
        url: "/api/note/moocs/video/create",
        method: Method.POST,
        data: createDTO,
        needToken: true
    })
}

export function createMooc(Data: {
    title: string,
    cover: string,
    moocDescription?: string,
    knowledgeBaseId: number,
    dataScope?: number
}) {
    return request<ResData<number>>({
        url: "/api/note/moocs",
        method: Method.POST,
        data: Data,
        needToken: true
    })
}

export function getMoocItemList(params: {
    parentId: number,
    page: number,
    pageSize: number,
    moocId: number,
    moocItemType?: number
}) {
    return request<ResData<PageBean<MoocItem>>>({
        url: `/api/note/moocs/items`,
        method: Method.GET,
        needToken: true,
        params: params
    })
}

export function createMoocItem(Data: {
    moocId: number,
    knowledgeBaseId: number,
    items: Array<MoocItem>
}) {
    return request<ResData<string>>({
        url: `/api/note/moocs/items`,
        method: Method.POST,
        needToken: true,
        data: Data
    })
}

export function updateMoocItem(itemId:number, Data: {
    moocId: number,
    knowledgeBaseId: number,
    title?: string,
    objectName?: string,
    parentId?: number,
    itemText?: string,
}) {
    return request<ResData<string>>({
        url: `/api/note/moocs/items/${itemId}`,
        method: Method.PATCH,
        needToken: true,
        data: Data
    })
}

export function getMoocItemInfoById(params: {
    moocId: number,
    moocItemId: number,
}) {
    return request<ResData<any>>({
        url: `/api/note/moocs/items/${params.moocItemId}`,
        method: Method.GET,
        needToken: true,
        params: {
            moocId: params.moocId,
        }
    })
}
