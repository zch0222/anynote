import useSWR from "swr";
import {getMoocInfoById} from "@/requests/client/note/mooc";

export default function useMoocItem({moocId}: {
    moocId: number;
}) {
    return useSWR({
        url: `/api/note/moocs?moocId=${moocId}`,
    }, () => getMoocInfoById({id: moocId}).then(res => res.data.data))
}
