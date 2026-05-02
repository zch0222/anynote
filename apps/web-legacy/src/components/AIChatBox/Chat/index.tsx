'use client'

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import ChatText from "@/components/AIChatBox/ChatText";
import {Button, Textarea} from "@nextui-org/react";
import {useEffect, useRef, useState} from "react";
import {ChatMessage} from "@/types/aiTypes";
import {scrollToBottoms} from "@/utils/nodeUtil";
import {nanoid} from "nanoid";
import {Input, Drawer, Card, Select} from "antd";
import {AxiosProgressEvent, AxiosResponse, GenericAbortSignal} from "axios";
import useChatConversation from "@/hooks/useChatConversation";
import EmptyIcon from "@/components/svg/EmptyIcon";
import {EventSourceMessage} from "@microsoft/fetch-event-source";
import { getDateString } from "@/utils/date";
import useNode from "@/hooks/useNode";
import {it} from "node:test";
// import MuyaMarkDownEditor from "@/components/MuyaMarkDownEditor";
import MilkdownEditorWrapper from "@/components/MilkdownEditor";
import {modelOptions} from "@/constants/model";

function Chat({generate, conversationId, setChatInfo, setConversationId, setModel}: {
    generate: (params: {
        prompt: string,
        conversationId: number | null,
        onmessage: (event: EventSourceMessage) => void,
        onerror: (event: ErrorEvent) => void,
        signal?: GenericAbortSignal
    }) => Promise<void>,
    conversationId: number | null,
    setChatInfo: (title: {
        title: string,
        messageCount: number
    }) => void,
    setConversationId: (value: number | null) => void
    setModel: (model: string) => void,
}) {

    const [isChatting, setIsChatting] = useState<boolean>(false)
    // const textRef = useRef<HTMLDivElement>(null);

    const [textBox, textBoxRef] = useNode()

    const [prompt, setPrompt] = useState("")
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [inputType, setInputType] = useState<"text" | "markdown">("text")
    const [initModel, setInitModel] = useState<string>(modelOptions[0].value)

    const { data } = useChatConversation(conversationId)

    const resTextLength = useRef(0);
    const messagesRef = useRef<ChatMessage[]>([])

    const controller = new AbortController();

    useEffect(() => {
        // scrollToBottoms(textBox)

        if (data) {
            setMessages(data.messages)
            setChatInfo({
                title: data.conversation.title,
                messageCount: data.messages.length,
            })
        }
        else {
            setChatInfo({
                title: "New Chat",
                messageCount: 0
            })
        }
    }, [data, setChatInfo, textBox]);

    useEffect(() => {
        if (!conversationId) {
            setMessages([])
        }
    }, [conversationId]);

    useEffect(() => {
        setModel(initModel)
    }, [initModel]);

    useEffect(() => {
        setChatInfo({
            title: data?.conversation.title || "New Chat",
            messageCount: messages.length
        })
        scrollToBottoms(textBox)
    }, [data, messages, setChatInfo])

    const updateInputType = () => {
        if ("text" === inputType) {
            setInputType("markdown")
        }
        else {
            setInputType("text")
        }
    }

    const send = () => {
        if (!prompt || "" === prompt) {
            return
        }
        setIsChatting(true)
        const nowDate = new Date()

        setIsChatting(true)

        messagesRef.current = [
            ...messages,
            {
                id: nanoid(),
                content: prompt,
                role: 0,
                updateTime: getDateString(nowDate)
            },
            {
                id: nanoid(),
                content: "",
                role: 1,
                updateTime: getDateString(nowDate),
                status: "running"
            }
        ]

        setMessages(messagesRef.current)

        setPrompt("")
        // scrollToBottoms(textBox)
        // scrollToBottoms(textRef)
        generate({
            conversationId: conversationId,
            prompt: prompt,
            // signal: controller.signal,
            onmessage: (event: EventSourceMessage) => {
                try {
                    console.log(event.data)
                    const messageData = JSON.parse(event.data);
                    console.log(messageData.data, messageData.data.conversationId)
                    messagesRef.current[messagesRef.current.length-1] = {
                        id: nanoid(),
                        conversationId: messageData.data.conversationId,
                        content: messagesRef.current[messagesRef.current.length-1].content + messageData.data.message,
                        role: 1,
                        updateTime: getDateString(new Date()),
                        status: messageData.data.status
                    }
                    setMessages([...messagesRef.current])
                    console.log(messages, messagesRef.current)
                } catch (e) {
                    console.log(e)
                }
            },
            onerror: (event: ErrorEvent) => {
                console.log(event)
                // controller.abort()
            },
        }).finally(
            () => {
                console.log(messagesRef.current)
                setIsChatting(false)
                // scrollToBottoms(textBox)
                if (!conversationId) {
                    console.log(messagesRef.current[messagesRef.current.length-1])
                    setConversationId(messagesRef.current[messagesRef.current.length-1].conversationId || null)
                }
            }
        )
    }

    return (
        <div
            className="flex flex-col w-full h-full overflow-hidden"
            style={{
                position: 'relative'
            }}
        >
            <div
                className="w-full flex-1 overflow-y-auto"
                ref={textBoxRef}
            >
                <div
                    className="flex-grow flex flex-col max-w-[800px] m-auto"
                    style={{
                        position: 'relative'
                    }}
                >
                    {messages.length > 0 ? messages.map(item => (
                        <ChatText
                            key={item.id}
                            data={{
                                id: item.id,
                                content: item.content,
                                role: item.role,
                                updateTime: getDateString(new Date(item.updateTime))
                            }}
                            status={item.status}
                        />
                    )) : <div className="w-full h-full flex items-center justify-center"></div>}
                </div>
            </div>

            <Drawer
                open={'markdown' === inputType}
                placement={"bottom"}
                getContainer={false}
                onClose={() => {
                    updateInputType()
                }}
                mask={false}
                destroyOnClose={true}
            >
                <form
                    className="flex flex-col justify-between w-full h-full"
                    onSubmit={(event) => {
                        event.preventDefault()
                    }}
                >
                    <div className="w-full flex-grow overflow-y-auto">
                        <MilkdownEditorWrapper
                            onInput={(value: string) => setPrompt(value)}
                            content={prompt}
                        />
                    </div>
                    <div className="h-[50px] self-end">
                        <Button
                            className="font-bold text-white w-[60px] h-[32px] mt-1"
                            size="sm"
                            color="primary"
                            onClick={() => {
                                send()
                                updateInputType()
                            }}
                            isLoading={isChatting}
                            type="submit"
                        >
                            Send
                        </Button>
                    </div>
                </form>
            </Drawer>

            <div className="flex justify-center w-full">
                <Card className="mt-auto border-t w-[800px]" bodyStyle={{padding: '10px 15px'}}>
                    {/* 顶部工具栏 */}
                    <div className="flex items-center gap-2 p-2 border-b">
                        <Select
                            options={modelOptions}
                            value={initModel}
                            onSelect={(value) => {
                                setInitModel(value)
                                console.log(value)
                            }}
                            placement={"topLeft"}
                        />
                        {/*<Button*/}
                        {/*    color={'primary'}*/}
                        {/*    variant={"faded"}*/}
                        {/*    className="flex items-center gap-1 px-3 py-1 rounded-full text-gray-600 hover:bg-gray-100"*/}
                        {/*    size="sm"*/}
                        {/*>*/}
                        {/*    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">*/}
                        {/*        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>*/}
                        {/*    </svg>*/}
                        {/*    深度思考*/}
                        {/*</Button>*/}
                    </div>

                    <form
                        className="flex flex-col"
                        onSubmit={(event) => {
                            event.preventDefault()
                        }}
                    >
                        {/* 输入区域 */}
                        <div className="p-3">
                            <Input.TextArea
                                rows={3}
                                style={{
                                    resize: 'none',
                                    border: 'none',
                                    boxShadow: 'none',
                                    padding: '0',
                                }}
                                autoFocus={true}
                                onChange={(e) => setPrompt(e.target.value)}
                                value={prompt}
                                placeholder="发消息、输入@选择技能或/选择文件"
                                onKeyDown={(e) => {
                                    if (e.keyCode === 13) {
                                        e.preventDefault()
                                        send()
                                    }
                                }}
                            />
                        </div>

                        {/* 底部工具栏 */}
                        <div className="flex items-center justify-between px-3 py-2 border-t">
                            <div className="flex items-center gap-3">
                                <Button
                                    color={'primary'}
                                    variant={"faded"}
                                    className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                                    size="sm"
                                    isIconOnly
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                                    </svg>
                                </Button>
                                <Button
                                    color={'primary'}
                                    variant={"faded"}
                                    className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                                    size="sm"
                                    isIconOnly
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                                    </svg>
                                </Button>
                                <Button
                                    color={'primary'}
                                    variant={"faded"}
                                    className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                                    size="sm"
                                    isIconOnly
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 4.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243zm4.758-4.758a3 3 0 004.243-4.243 3 3 0 00-4.243 4.243z"/>
                                    </svg>
                                </Button>
                                <Button
                                    color={'primary'}
                                    variant={"faded"}
                                    className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                                    size="sm"
                                    isIconOnly
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
                                    </svg>
                                </Button>
                                <Button
                                    color={'primary'}
                                    variant={"faded"}
                                    className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                                    size="sm"
                                    isIconOnly
                                    onClick={() => {
                                        if ("text" === inputType) {
                                            setInputType("markdown")
                                        }
                                        else {
                                            setInputType("text")
                                        }
                                    }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"/>
                                    </svg>
                                </Button>
                            </div>
                            <Button
                                color={'primary'}
                                className="px-4 py-1 text-white rounded-full"
                                size="sm"
                                onClick={send}
                                isLoading={isChatting}
                                type="submit"
                            >
                                发送
                            </Button>
                        </div>
                    </form>
                </Card>
            </div>
        </div>
    )
}

export default withThemeConfigProvider(Chat)
