import useSWR from "swr";
import { getSysUserList } from "@/requests/client/manage/manageUser";
import { SWRParams } from "@/types/paginationTypes";

export default function useSysUserList({params, page, pageSize}: SWRParams<{
    username: string | undefined
}>) {

    return useSWR({
        url: `/api/manage/users?page=${page}&pageSize=${pageSize}`,
        params: params
    }, () => getSysUserList({
        page: page,
        pageSize: pageSize,
        username: params.username
    }).then(res => res.data.data))
}
