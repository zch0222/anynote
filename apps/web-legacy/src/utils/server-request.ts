import { AxiosResponse } from "axios";
import store from "@/store";

import { service, MyAxiosRequestConfig, Method } from "./request";

import { getToken } from "@/utils/token";
import {refreshToken} from "@/utils/client-request";

service.interceptors.request.use(
    async (config: MyAxiosRequestConfig) => {
        const accessToken: string | null | undefined = getToken();
        if (config.needToken && accessToken) {
            config.headers['accessToken'] = accessToken;
        }
        return config;
    },
    error => {
        Promise.reject(error);
    }
);

service.interceptors.response.use(
    response => {
        if (response.data.code !== '00000') {
            // alert(response.data.msg);
            return Promise.reject(response.data.msg)
        }
        return response
    },
    async error => {
        return Promise.reject(error);
    }
)

export { Method }

export default function serverRequest<T>(options: {
    url: string,
    method: string,
    needToken: boolean,
    data?: any
}): Promise<AxiosResponse<T>> {
    return service(options);
}

