import {PageBean} from "@/types/requestTypes";
import { AxiosResponse } from "axios";

export default async function getAllItems(params: any,
                                          requestMethod: (params: any) => Promise<AxiosResponse<PageBean<any>>>) {
    // const firstRes = await requestMethod(params)
    // if (firstRes.data.rows.length <= firstRes.data.total) {
    //     return firstRes.data.rows
    // }
    // else {
    //     const nextRes =
    // }

}