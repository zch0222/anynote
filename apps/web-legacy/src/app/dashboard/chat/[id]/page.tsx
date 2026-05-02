'use client'

import {useCallback, useState} from "react";
import AIChatBox from "@/components/AIChatBox";
import {EventSourceMessage} from "@microsoft/fetch-event-source";
import {GenericAbortSignal} from "axios";
import {query, chatCompletions} from "@/requests/client/note/doc";
import {Input} from "@nextui-org/react";
import { Select } from 'antd';
import { useRouter } from "next/navigation";
import {CHAT_GPT} from "@/constants/route";
import {modelOptions} from "@/constants/model";

function ChatPage({params}: {
    params: {
        id: string
    }
}) {

    const { id } = params
    const router = useRouter()
    const [model, setModel] = useState<string>(modelOptions[0].value)

    const onConversationChange = useCallback((value: number | null) => {
        console.log(value)
        router.replace(`${CHAT_GPT}/${value ? value : 'new'}`)
    }, [router]);

    const completions = useCallback((params: {
        prompt: string,
        conversationId: number | null,
        onmessage: (event: EventSourceMessage) => void,
        onerror: (event: ErrorEvent) => void,
        signal?: GenericAbortSignal
    }) => {
        return chatCompletions({
            model: model,
            ...params
        })
    }, [model])

    return (
        <div className="flex flex-col w-full h-full p-5">
            <AIChatBox
                onConversationChange={onConversationChange}
                initConversationId={'new' === id ? undefined : parseInt(id)}
                generate={completions}
                setModel={setModel}
            />
        </div>
    )
}

export default ChatPage
