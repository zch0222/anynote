import request, {Method} from "@/utils/client-request"
import {
    OssSliceUploadSignatureDTO,
    OssSliceUploadSignatureVO,
    OssSliceUploadChunkMarkVO,
    OssSliceUploadComposeOV, OssSliceUploadTaskVO, ObjectURL
} from "@/types/fileTypes";
import {ResData} from "@/types/requestTypes";

/**
 * 获取分片上传签名
 * @param dto 请求参数
 */
export function getOssSliceUploadSignature(dto: OssSliceUploadSignatureDTO) {
    return request<ResData<OssSliceUploadSignatureVO>>({
        url: "/api/file/getOssSliceUploadSignatures",
        method: Method.POST,
        data: dto,
        needToken: true
    })
}

export function markOssUploadSlice(data: OssSliceUploadSignatureDTO) {
    return request<ResData<OssSliceUploadChunkMarkVO>>({
        url: "/api/file/markOssSliceUploadSignatures",
        method: Method.POST,
        data: data,
        needToken: true
    })
}

export function ossSliceUploadComposeObject(data: {
    uploadId: string
}) {
    return request<ResData<OssSliceUploadComposeOV>>({
        url: "/api/file/composeOssSliceUploadObject",
        method: Method.POST,
        data: data,
        needToken: true
    })
}

/**
 * 获取分片上传状态
 * @param uploadId 上传任务ID
 */
export function getOssSliceUploadTaskInfo(uploadId: string) {
    return request<ResData<OssSliceUploadTaskVO>>({
        url: `/api/file/ossSliceUploadTask/${uploadId}`,
        method: Method.GET,
        needToken: true
    })
}

export function getObjectUrlByObjectName(objectName: string) {
    return request<ResData<ObjectURL>>({
        url: `/api/file/public/byObjectName`,
        method: Method.GET,
        params: {objectName: objectName},
        needToken: true
    })
}