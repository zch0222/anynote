import request, { Method, service } from "@/utils/request";
import {GenericAbortSignal} from "axios";


export function chat(params: {
    data: {
        id: number,
        prompt: string
    },
    onDownloadProcess: any,
    signal: GenericAbortSignal
}) {
    return service.post(`/api/note/docs/${params.data.id}/query`, {
        prompt: params.data.prompt
    }, {
        onDownloadProgress: params.onDownloadProcess,
        signal: params.signal
    })
}
