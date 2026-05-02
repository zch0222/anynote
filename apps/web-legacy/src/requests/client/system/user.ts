import request, {Method} from "@/utils/client-request"
import {ResData} from "@/types/requestTypes";
import {SysUserInfo} from "@/types/manageTypes";

export function getMyUserInfo() {
    return request<ResData<SysUserInfo>>({
        url: "/api/system/user/mine",
        method: Method.GET,
        needToken: true
    })
}

export function getPublicUserInfo(params: {
    username: string
}) {
    return request<ResData<SysUserInfo>>({
        url: `/api/system/user/pubInfo/${params.username}`,
        method: Method.GET,
        needToken: true
    })
}

export function resetPassword(params: {
    userId: number,
    newPassword: string
}) {
    return request<ResData<string>>({
        url: "/api/system/user/resetPassword",
        method: Method.POST,
        data: params,
        needToken: true
    })
}