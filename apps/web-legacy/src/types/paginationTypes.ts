import {SWRResponse} from "swr";
import {ComponentType} from "react";
import {PageBean} from "./requestTypes";

export interface SWRParams<T> {
    params: T
    page: number
    pageSize: number
}

export interface PageParams<T> {
    params: T
    page: number
    pageSize: number
    swr: ({params, page, pageSize}: {
        params: any,
        page: number,
        pageSize: number
    }) => SWRResponse<PageBean<any>>
    Item: ComponentType<{data: any}>
}