import useSWR from "swr";
import {getMoocList} from "@/requests/client/note/mooc";

export default function useMoocList({params, page, pageSize}: {
    params: {
        knowledgeId: number
    },
    page: number,
    pageSize: number
}) {
    return useSWR({
        url: `/api/mooc?page=${page}&pageSize=${pageSize}`,
        params: params
    }, () => getMoocList({
        page: page,
        pageSize: pageSize,
        ...params
    }).then(res => res.data.data))
}
