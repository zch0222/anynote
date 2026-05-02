import useSWR from "swr";
import { getMyUserInfo } from "@/requests/client/system/user";

export default function useMyUserInfo() {
    return useSWR('/api/system/user/mine', () => getMyUserInfo()
        .then(res => res.data.data))
}