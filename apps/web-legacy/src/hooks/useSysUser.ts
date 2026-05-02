import {getSysUserInfoById} from "@/requests/client/manage/manageUser";
import useSWR from "swr";

export default function useSysUser(params: {
    userId: number
}) {
    return useSWR(`/api/manage/users/${params.userId}`, () => getSysUserInfoById(params).then(
        res => res.data.data
    ))
}