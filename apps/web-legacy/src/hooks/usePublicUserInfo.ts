import useSWR from "swr";
import {getPublicUserInfo} from "@/requests/client/system/user";

export default function usePublicUserInfo(username: string) {
    return useSWR(`/api/system/user/pubInfo/${username}`, () => getPublicUserInfo({
        username: username
    }).then(res => res.data.data))
}