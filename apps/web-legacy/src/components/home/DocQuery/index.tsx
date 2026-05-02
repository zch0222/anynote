'use client'

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import PDFViewer from "@/components/chat-pdf/PDFViewer";
import {useCallback, useEffect, useState} from "react";
import {getHomeDoc} from "@/requests/client/note/doc";
import Loading from "@/components/Loading";
import {DocVO} from "@/types/noteTypes";
import useIsMobile from "@/hooks/useIsMobile";
import AIChatBox from "@/components/AIChatBox";
import {Card} from "@nextui-org/react";
import {EventSourceMessage} from "@microsoft/fetch-event-source";
import {GenericAbortSignal} from "axios";
import { freeDocQuery } from "@/requests/client/note/doc";


function DocQuery() {

    const [loading, setLoading] = useState(true);
    const [doc, setDoc] = useState<null | DocVO>(null)
    const isMobile = useIsMobile()

    useEffect(() => {
        getHomeDoc().then(
            res => {
                console.log(res.data)
                setDoc(res.data.data)
            }
        ).finally(
            () => setLoading(false)
        )
    }, []);

    const docQuery = useCallback((params: {
        prompt: string,
        conversationId: number | null,
        onmessage: (event: EventSourceMessage) => void,
        onerror: (event: ErrorEvent) => void,
        signal?: GenericAbortSignal
    }) => {
        return freeDocQuery({
            docId: doc?.id,
            ...params
        })
    }, [doc])

    return (
        <>
            {
                isMobile ?
                    <div
                        className={`flex flex-row w-full ${isMobile ? "h-[650px]" : "h-[800px]"} max-w-[600px] min-w-[375px]`}>
                        {
                            !doc ? <Loading/> :
                                <PDFViewer
                                    src={doc.url}
                                    docId={doc.id}
                                    doc={doc}
                                    isShowAIModule={false}
                                />
                        }
                    </div>
                    :
                    <div className="flex flex-col items-center w-full">
                        <div
                            id="docQuery"
                            className="w-[400px] h-[100px] flex flex-col mt-[20px] mb-[20px] justify-center items-center"
                            // style={{
                            //     backgroundImage: `url(https://anynote.obs.cn-east-3.myhuaweicloud.com/images/home/cool-background.png)`,
                            //     backgroundPosition: 'center',
                            //     backgroundSize: 'cover',
                            //     backgroundRepeat: 'no-repeat'
                            // }}
                        >
                            <div className="text-3xl font-bold">
                                接入本地知识库
                            </div>
                        </div>
                        <div className="flex flex-row justify-center pl-[100px] pr-[150px] w-full h-[850px]">
                            <div className="w-[60%] mr-[80px]">
                                {
                                    !doc ? <Loading/> :
                                        <PDFViewer
                                            src={doc.url}
                                            docId={doc.id}
                                            doc={doc}
                                            isShowAIModule={false}
                                            isShowTitle={false}
                                        />
                                }
                            </div>
                            <div className="w-[30%] max-w-[500px] min-w-[450px]">
                                <Card
                                    className="w-full h-full p-2"
                                >
                                    {
                                        !doc ? <Loading/> :
                                            <AIChatBox
                                                isShowHead={false}
                                                docId={doc?.id}
                                                generate={docQuery}
                                            />
                                    }
                                </Card>
                            </div>
                        </div>
                    </div>
            }
        </>

    )
}

export default withThemeConfigProvider(DocQuery)
