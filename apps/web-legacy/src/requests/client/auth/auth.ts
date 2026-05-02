import request, { Method } from "@/utils/client-request";

import { LoginRequest, UserInfo } from "@/types/authTypes";
import { ResData } from "@/types/requestTypes";

export const loginUrl = "/api/auth/login"

export function login(params: LoginRequest) {
    return  request<ResData<UserInfo>>({
        url: loginUrl,
        method: Method.POST,
        needToken: false,
        data: params
    })
}

export function resetPassword(params: {
    oldPassword: string,
    newPassword: string
}) {
    return request<ResData<UserInfo>>({
        url: "/api/auth/resetPassword",
        method: Method.POST,
        needToken: true,
        data: params
    })
}

export function register(params: {
    username: string,
    nickname: string,
    password: string,
    email?: string,
    sex: number
}) {
    
    return request<ResData<UserInfo>>({
        url: "/api/auth/register",
        method: Method.POST,
        needToken: false,
        data: params
    })
    
}
