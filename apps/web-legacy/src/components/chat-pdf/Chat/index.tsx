'use client'
import { Input, Button, Textarea } from "@nextui-org/react";
import {useEffect, useState, useRef, useCallback} from "react";
import {nanoid} from "nanoid";
import { query } from "@/requests/client/note/doc";
import { MoreOutlined } from "@ant-design/icons";
import { Drawer } from "antd";
import { useMemo } from "react";

import ChatText from "@/components/chat-pdf/Chat/ChatText";
import AIChatBox from "@/components/AIChatBox";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import { scrollToBottoms } from "@/utils/nodeUtil";
import useChatConversationList from "@/hooks/useChatConversationList";
import { updateChatConversation } from "@/requests/client/ai/chat";
import Pagination from "@/components/Pagination";
import createPage from "@/components/hoc/createPage/createPage";

import { chat } from "@/requests/chatPDF";
import {ChatConversationInfoVO} from "@/types/aiTypes";
import InfiniteScroll from "@/components/InfiniteScroll";
import {useTheme} from "next-themes";
import {AxiosProgressEvent, GenericAbortSignal} from "axios";
import {EventSourceMessage} from "@microsoft/fetch-event-source";

function ChatConversationListItem({ data, itemProps }: {
    data: ChatConversationInfoVO,
    itemProps?: {
        setConversationId: (value: number) => void,
        selectedId: number | null
    }
}) {

    console.log(itemProps)

    const { theme } = useTheme()

    const hoveredBg = 'light' === theme ? 'bg-[#FAFAFA]' :  'bg-[#262626]'

    const [isHover, setIsHover] = useState(false)

    return (
        <div
            className={`${isHover ? hoveredBg : ""} ${itemProps?.selectedId === data.id ? "border-l-3 border-[#01B96B]" : ''} cursor-pointer p-2`}
            style={{
                minHeight: "50px"
            }}
            onMouseEnter={() => setIsHover(true)}
            onMouseLeave={() => setIsHover(false)}
            onClick={() => {
                updateChatConversation({
                    id: data.id
                }).then(res => {
                    console.log(res)
                }).catch(
                    e => console.log(e)
                )
                if (itemProps) {
                    itemProps.setConversationId(data.id)
                }
            }}
        >
            <div
                className="text-base font-bold"
            >
                {data.title}
            </div>
        </div>
    )
}


function Chat({ docId }: {
    docId: number
}) {

    let controller = new AbortController()

    const [isChatting, setIsChatting] = useState<boolean>(false)
    const [isOpenHistoryDrawer, setIsOpenHistoryDrawer] = useState<boolean>(false)
    const [conversationId, setConversationId] = useState<number | null>(null)
    const [prompt, setPrompt] = useState("")
    const [messages, setMessages] = useState<{
        id: string,
        message: string,
        role: string
    }[]>([])

    const isChatBegin = useRef<boolean>(false)
    const resTextLength = useRef(0);
    const textRef = useRef<HTMLDivElement>(null);

    const docQuery = useCallback((params: {
        prompt: string,
        conversationId: number | null,
        onmessage: (event: EventSourceMessage) => void,
        onerror: (event: ErrorEvent) => void,
        signal?: GenericAbortSignal
    }) => {
        return query({
            docId: docId,
            ...params
        })
    }, [docId])



    // useEffect(() => {
    //     if (!isChatBegin.current) {
    //         return
    //     }
    //     isChatBegin.current = false
    //
    //     const question = prompt
    //     setPrompt("")
    //     scrollToBottoms(textRef)
    //     // const match = pdfUrl.match(/\/([^\/]*\.pdf)/)
    //     // if (match) {
    //     //     console.log(match[1]);
    //     // }
    //     // const fileKey = match?.[1].replace(".", "_")
    //     // if (!fileKey) {
    //     //     return;
    //     // }
    //     // console.log(fileKey)
    //     resTextLength.current = 0
    //     query({
    //         signal: new AbortController().signal,
    //         docId: docId,
    //         prompt: prompt,
    //         onDownloadProgress: (event) => {
    //             console.log(event.event.target.responseText)
    //             const responseText = event.event.target.responseText
    //             const regex = /data:\s*([^]+?)(?=\n\nid:|\n$|$)/g;
    //             let matches = [...responseText.matchAll(regex)];
    //             console.log("LastPart", matches[matches.length-1][1])
    //             const lastJsonString = matches[matches.length-1][1]; // 确保找到以"data: "开头的部分
    //             if (lastJsonString) {
    //                 try {
    //                     console.log(JSON.parse(lastJsonString))
    //                     const messageData = JSON.parse(lastJsonString); // 正确地解析JSON字符串
    //                     console.log(messageData.data.message.replace(/\n/g, "\n\n"))
    //                     const newMessage = {
    //                         id: nanoid(), // 确保nanoid()函数已被正确引入
    //                         message: messageData.data.message.replace(/\n/g, "\n\n"),
    //                         role: "bot"
    //                     };
    //                     const newMessages = [...messages]
    //                     newMessages[newMessages.length-1] = newMessage
    //                     setMessages(newMessages); // 使用函数式更新以防止依赖旧的state
    //                     resTextLength.current = responseText.length
    //                 } catch (e) {
    //                     console.log(e)
    //                 }
    //             }
    //         }
    //
    //     }).then(
    //         res => console.log(res)
    //     ).catch(
    //         e => console.log(e)
    //     ).finally(
    //         () => {
    //             setIsChatting(false)
    //             scrollToBottoms(textRef)
    //         }
    //     )
    // }, [messages])

    useEffect(() => {
        if (conversationId !== null) {

        }
    }, [conversationId]);


    const send = () => {
        if (!prompt || "" === prompt) {
            return
        }
        setIsChatting(true)
        setMessages([
            ...messages,
            {
                id: nanoid(),
                message: prompt,
                role: "user"
            },
            {
                id: nanoid(),
                message: "",
                role: "bot"
            }
        ])
        isChatBegin.current = true
    }

    const conversationScrollItemProps = useMemo(() => ({
        setConversationId: setConversationId,
        selectedId: conversationId
    }), [conversationId])




    return (
        <div className="flex flex-col w-full h-full">
            {/*<div>*/}
            {/*    <Button*/}
            {/*        isIconOnly={true}*/}
            {/*        onPress={() => setIsOpenHistoryDrawer(true)}*/}
            {/*    >*/}
            {/*        <MoreOutlined*/}
            {/*            style={{*/}
            {/*                fontSize: 25*/}
            {/*            }}*/}
            {/*        />*/}
            {/*    </Button>*/}
            {/*    <Drawer*/}
            {/*        open={isOpenHistoryDrawer}*/}
            {/*        closable={false}*/}
            {/*        placement="left"*/}
            {/*        onClose={() => setIsOpenHistoryDrawer(false)}*/}
            {/*        getContainer={false}*/}
            {/*        destroyOnClose={true}*/}
            {/*    >*/}
            {/*        <div className="flex flex-col w-full h-full overflow-hidden">*/}
            {/*            <Button*/}
            {/*                className="text-white"*/}
            {/*                color="primary"*/}
            {/*                onPress={() => {*/}
            {/*                    setConversationId(null)*/}
            {/*                    setIsOpenHistoryDrawer(false)*/}
            {/*                }}*/}
            {/*            >*/}
            {/*                新建对话*/}
            {/*            </Button>*/}
            {/*            <div className="flex-grow overflow-hidden w-full mt-2">*/}
            {/*                <InfiniteScroll*/}
            {/*                    swr={useChatConversationList}*/}
            {/*                    params={{*/}
            {/*                        docId: docId*/}
            {/*                    }}*/}
            {/*                    Item={ChatConversationListItem}*/}
            {/*                    itemProps={conversationScrollItemProps}*/}
            {/*                />*/}
            {/*            </div>*/}
            {/*        </div>*/}
            {/*    </Drawer>*/}
            {/*</div>*/}
            {/*<div*/}
            {/*    className="flex-grow flex flex-col overflow-y-auto"*/}
            {/*    ref={textRef}*/}
            {/*>*/}
            {/*    {messages.map(item => (*/}
            {/*        <ChatText*/}
            {/*            key={item.id}*/}
            {/*            text={item.message}*/}
            {/*            role={item.role}*/}
            {/*        />*/}
            {/*    ))}*/}
            {/*</div>*/}
            {/*<form*/}
            {/*    className="flex flex-row items-center"*/}
            {/*    onSubmit={() => console.log(111)}*/}
            {/*>*/}
            {/*    <Textarea*/}
            {/*        className="mr-2"*/}
            {/*        placeholder={"请输入问题"}*/}
            {/*        onValueChange={setPrompt}*/}
            {/*        value={prompt}*/}
            {/*        onKeyDown={(e) => {*/}
            {/*            console.log(e.keyCode)*/}
            {/*            if (e.keyCode === 13) {*/}
            {/*                e.preventDefault()*/}
            {/*                send()*/}
            {/*            }*/}
            {/*        }}*/}
            {/*    />*/}
            {/*    <Button*/}
            {/*        className="h-[55px] font-bold"*/}
            {/*        color="primary"*/}
            {/*        onClick={send}*/}
            {/*        isLoading={isChatting}*/}
            {/*        type="submit"*/}
            {/*    >*/}
            {/*        Send*/}
            {/*    </Button>*/}
            {/*</form>*/}
            <div className="w-full h-full overflow-hidden">
                <AIChatBox
                    conversationId={conversationId}
                    generate={docQuery}
                    docId={docId}
                />
            </div>
        </div>
    )
}

export default withThemeConfigProvider(Chat)
