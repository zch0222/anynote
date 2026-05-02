import useSWR from "swr";
import {getMoocItemList} from "@/requests/client/note/mooc";

export default function useMoocItemList({params, page, pageSize}: {
    params: {
        parentId: number,
        moocId: number,
        moocItemType?: number,
    },
    page: number,
    pageSize: number
}) {
    return useSWR({
        url: `/api/moocs/items?page=${page}&pageSize=${pageSize}&parentId=${params.parentId}`,
        params: params
    }, () => getMoocItemList({
        page: page,
        pageSize: pageSize,
        ...params
    }).then(res => res.data.data))
}
