import axios, {all, AxiosHeaders, AxiosProgressEvent, AxiosResponse, GenericAbortSignal} from "axios";
import store from "@/store";
import {message} from "antd";
import { showMessage } from "@/store/message/messageSlice";

import {service, MyAxiosRequestConfig, Method, getTokenDebounce, streamService} from "./request";
import {AxiosHeaderValue, HeadersDefaults} from "axios";
import { Readable } from 'stream';
import {EventSourceMessage, fetchEventSource} from '@microsoft/fetch-event-source';




const onBeforeFulfilled = async (config: MyAxiosRequestConfig) => {
        // console.log(store.getState().user)
        const accessToken: string | undefined = store.getState().user.token?.accessToken;
        if (config.needToken && accessToken) {
            config.headers['accessToken'] = accessToken;
        }
        return config;
}

service.interceptors.request.use(
    onBeforeFulfilled,
    error => {
        Promise.reject(error);
    }
);

streamService.interceptors.request.use(
    onBeforeFulfilled,
    error => {
        Promise.reject(error);
    }
)

export const refreshToken = getTokenDebounce();
var isRefreshToken = 0;
var isRefreshing = false;
let requests: Function[] = [];

service.interceptors.response.use(
    response => {
        if (response.data.code !== '00000') {
            // alert(response.data.msg);
            // message.error(response.data.msg)
            store.dispatch(showMessage({
                type: "error",
                content: response.data.msg
            }))
            return Promise.reject(response.data.msg)
        }
        return response
    },
    async error => {
        console.log("re111111");
        const errorResponse = error.response || {};
        const errorData = errorResponse.data || {};
        console.log(errorResponse.status);
        if (errorResponse.status === 401) {
            message.info("请先登录").then(res => window.location.replace("/login"))

            isRefreshToken++;

            console.log("isRRRRrrrrrrrrr", isRefreshToken);
            if (isRefreshToken === 1) {
                const res = await refreshToken();
                if (res !== "success") {
                    // PubSub.publish("NAVIGATE", "login");
                    localStorage.clear();
                    message.info("请先登录");
                    return Promise.reject("请先登录")
                }
                isRefreshToken = 0;

                requests.forEach(re => {
                    console.log("re-------------");
                    re(localStorage.getItem("accessToken"))
                });
                requests = [];
                console.log(res);
                if (res === undefined) {
                    return Promise.reject("登录失效")
                }
                return service(error.response.config);
            } else {
                return new Promise(resolve => {
                    requests.push((token: string) => {
                        error.response.config.headers.accessToken = `${token}`;
                        console.log(token);
                        console.log("666666", error.response.config);
                        resolve(service(error.response.config));
                    })
                })
            }
        } else if (errorResponse.status !== 401) {
            console.log(1212121)
            message.error("服务器异常，请稍后再试")
            // alert("服务器异常请稍后再试试");
            // PubSub.publish("MODAL NOTICE", {
            //     type: 'error',
            //     config: {
            //         title: "请求失败",
            //         content: "网络异常"
            //     }
            // });
        }
        return Promise.reject(error);
    }
)

export { Method }

export default function clientRequest<T>(options: {
    url: string,
    method: string,
    needToken: boolean,
    data?: any,
    params?: any,
    onUploadProgress?: (progressEvent: AxiosProgressEvent) => void,
    onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void;
    headers?: AxiosHeaders,
    withCredentials?: boolean,
}): Promise<AxiosResponse<T>> {
    return service(options);
}

export function streamRequest<T>(options: {
    url: string,
    method: string,
    needToken: boolean,
    data?: any,
    params?: any,
    onmessage: (event: EventSourceMessage) => void,
    onerror: (event: ErrorEvent) => void,
    headers?: HeadersDefaults & {
        [key: string]: AxiosHeaderValue
    },
    withCredentials?: boolean,
    signal?: GenericAbortSignal
}) {

    console.log(options.url, process.env.NEXT_PUBLIC_BASE_URL)

    return fetchEventSource(`${process.env.NEXT_PUBLIC_BASE_URL}${options.url}`, {
        method: options.method,
        headers: {
            'Content-Type': 'application/json',
            // 'Content-Type': 'application/x-www-form-urlencoded',
            "accessToken": store.getState().user.token?.accessToken || ""
        },
        body: options.data ? JSON.stringify(options.data) : undefined,
        onmessage: options.onmessage,
        onerror: options.onerror,
        openWhenHidden: true,
        signal: options.signal
    })

    // return fetch(`${process.env.NEXT_PUBLIC_BASE_URL}${options.url}`, {
    //     method: options.method,
    //     headers: {
    //         'Content-Type': 'application/json',
    //         // 'Content-Type': 'application/x-www-form-urlencoded',
    //         "accessToken": store.getState().user.token?.accessToken || ""
    //     },
    //     body: options.data ? JSON.stringify(options.data) : undefined
    // })

}

