import axios, { AxiosRequestConfig, InternalAxiosRequestConfig, AxiosResponse } from "axios";
// import {handleRefreshToken} from "../api/passport";
// import PubSub from "pubsub-js";
import {message} from "antd";
import store from "@/store";



export interface MyAxiosRequestConfig extends InternalAxiosRequestConfig {
    needToken?: boolean
}


const baseURL = process.env.NEXT_PUBLIC_BASE_URL
export const refreshToken = getTokenDebounce();
var isRefreshToken = 0;
var isRefreshing = false;

let requests: Function[] = [];

export const service = axios.create({
    timeout: 360000,
    baseURL: baseURL
})

export const streamService = axios.create({
    baseURL: process.env.NEXT_PUBLIC_BASE_URL,
    timeout: 360000,
    responseType: 'stream'
})


// service.interceptors.request.use(
//     async (config: MyAxiosRequestConfig) => {
//         const accessToken: string | undefined = store.getState().user.token?.accessToken;
//         if (config.needToken && accessToken) {
//             config.headers['accessToken'] = accessToken;
//             //         const payload = pareseJwt(accesstoken);
//             //  //       console.log(payload);
//             //         if (payload.exp < Math.round(new Date() / 1000)) {
//             //             console.log("exxxxxxxxxxxxxxx");
//             //             await refresh(config);
//             //         }
//         }
//         return config;
//     },
//     error => {
//         Promise.reject(error);
//     }
// );

// service.interceptors.response.use(
//     response => {
//         if (response.data.code !== '00000') {
//             // alert(response.data.msg);
//             message.error(response.data.msg)
//             return Promise.reject(response.data.msg)
//         }
//         return response
//     },
//     async error => {
//         console.log("re111111");
//         const errorResponse = error.response || {};
//         const errorData = errorResponse.data || {};
//         console.log(errorResponse.status);
//         if (errorResponse.status === 401) {
//             isRefreshToken++;
//
//             console.log("isRRRRrrrrrrrrr", isRefreshToken);
//             if (isRefreshToken === 1) {
//                 const res = await refreshToken();
//                 if (res !== "success") {
//                     // PubSub.publish("NAVIGATE", "login");
//                     localStorage.clear();
//                     message.info("请先登录");
//                     return Promise.reject("请先登录")
//                 }
//                 isRefreshToken = 0;
//
//                 requests.forEach(re => {
//                     console.log("re-------------");
//                     re(localStorage.getItem("accessToken"))
//                 });
//                 requests = [];
//                 console.log(res);
//                 if (res === undefined) {
//                     return Promise.reject("登录失效")
//                 }
//                 return service(error.response.config);
//             } else {
//                 return new Promise(resolve => {
//                     requests.push((token: string) => {
//                         error.response.config.headers.accessToken = `${token}`;
//                         console.log(token);
//                         console.log("666666", error.response.config);
//                         resolve(service(error.response.config));
//                     })
//                 })
//             }
//         } else if (errorResponse.status !== 401) {
//             console.log(1212121)
//             // alert("服务器异常请稍后再试试");
//             // PubSub.publish("MODAL NOTICE", {
//             //     type: 'error',
//             //     config: {
//             //         title: "请求失败",
//             //         content: "网络异常"
//             //     }
//             // });
//         }
//         return Promise.reject(error);
//     }
// )

export const Method = {
    GET: 'get',
    POST: 'post',
    PUT: 'put',
    DELETE: 'delete',
    PATCH: 'patch'
};


export default function clientRequest<T>(options: {
    url: string,
    method: string,
    needToken: boolean,
    data?: any
}): Promise<AxiosResponse<T>> {
    return service(options);
}







// 防抖闭包来一波
export function getTokenDebounce () {
    
}
