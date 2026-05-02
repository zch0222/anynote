import { streamRequest, Method } from "@/utils/client-request";
import {EventSourceMessage} from "@microsoft/fetch-event-source";
import {GenericAbortSignal} from "axios";

export function notice(params: {
    platform: string,
    onmessage: (event: EventSourceMessage) => void,
    onerror: (event: ErrorEvent) => void,
    signal?: GenericAbortSignal
}) {
    return streamRequest<void>({
        url: `/api/notify/notification?platform=${params.platform}`,
        method: Method.GET,
        params: params,
        needToken: true,
        onmessage: params.onmessage,
        onerror: params.onerror
    })
}