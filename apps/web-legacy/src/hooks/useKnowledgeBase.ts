import useSWR from "swr";
import { getKnowledgeBaseId } from "@/requests/client/note/knowledgeBase";

export default function useKnowledgeBase(knowledgeBaseId: number) {

    return useSWR(`/api/note/bases/${knowledgeBaseId}`, () => getKnowledgeBaseId({
        id: knowledgeBaseId
    }).then(res => res.data.data))
}
