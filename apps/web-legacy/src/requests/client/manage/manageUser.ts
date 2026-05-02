import request, {Method} from "@/utils/client-request"
import { PageBean, ResData } from "@/types/requestTypes";
import {SysUser, SysUserInfo} from "@/types/manageTypes";

export function getSysUserList(params: {
    page: number,
    pageSize: number,
    username: string | undefined
}) {
    console.log(params)
    return request<ResData<PageBean<SysUser>>>({
        url: '/api/manage/users',
        method: Method.GET,
        needToken: true,
        params: params
    })
}

export function getSysUserInfoById(params: {
    userId: number
}) {
    return request<ResData<SysUserInfo>>({
        url: `/api/manage/users/${params.userId}`,
        method: Method.GET,
        needToken: true
    })
}

export function updateSysUser(params: {
    userId: number,
    password: string
}) {
    return request<ResData<number>>({
        url: `/api/manage/users/${params.userId}`,
        method: Method.PATCH,
        needToken: true,
        data: params
    })

}
