'use client'
import {useState, useCallback, useEffect} from "react";
import { useTheme } from "next-themes";
import {useRouter} from "next/navigation";

import { Card } from "antd";
import InfiniteScroll from "@/components/InfiniteScroll";
import useNoteHistoryList from "@/hooks/useNoteHistoryList";
import HistoryContent from "@/components/note/HistoryContent";
import { getDateString } from "@/utils/date";
import { Button } from "antd";
import {NoteHistoryListItemVO} from "@/types/noteTypes";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import MarkDownViewer from "@/components/MarkDownViewer";
import {getNoteHistoryList} from "@/requests/client/note/note";

function HistoryListItem({ data, itemProps }: {
    data: NoteHistoryListItemVO,
    itemProps?: {
        selectOperationLogId: number,
        setSelectOperationLogId: (key: number) => void,
    }
}) {
    const { theme } = useTheme()

    const hoveredBg = 'light' === theme ? 'bg-[#FAFAFA]' :  'bg-[#262626]'

    console.log(itemProps)

    const [isHover, setIsHover] = useState(false)

    return (
        <div
            className={`${isHover ? hoveredBg : ""} ${itemProps?.selectOperationLogId === data.operationLogId ? "border-l-3 border-[#01B96B]" : ''} flex flex-col justify-center cursor-pointer p-2`}
            style={{
                height: 60
            }}
            onMouseEnter={() => setIsHover(true)}
            onMouseLeave={() => setIsHover(false)}
            onClick={() => itemProps?.setSelectOperationLogId(data.operationLogId)}
        >
            <div className="font-bold">{data.updaterNickname}</div>
            <div className="text-sm text-gray-400">{getDateString(new Date(data.operationTime))}</div>
        </div>
    )
}


function NoteHistory({params}: {
    params: {
        id: number
    }
}) {
    const router = useRouter()
    const { id } = params

    const [selectHistoryId, setSelectHistoryId] = useState<number | null>(null)

    const { data } = useNoteHistoryList({
        params: {
            noteId: id
        },
        page: 1,
        pageSize: 15
    })

    useEffect(() => {
        if (data && data.rows.length > 0) {
            setSelectHistoryId(data.rows[0].operationLogId)
        }
    }, [data])


    return (
        <div className="flex flex-row h-full w-full">
            <div className="h-full flex-grow">
                <div className="flex flex-col w-full h-full overflow-hidden">
                    <Card
                        className="flex-row items-center w-full"
                        style={{
                            borderRadius: 0,
                            height: 60
                        }}
                        bodyStyle={{
                            padding: 0,
                            height: 60
                        }}
                        // radius="none"
                    >
                        <div className="flex flex-row items-center h-full ml-2">
                            <Button onClick={() => router.back()}>返回文档</Button>
                        </div>
                    </Card>
                    <div className="flex flex-col items-center flex-grow overflow-auto w-full p-5 pb-2">
                        { selectHistoryId ? <HistoryContent operationId={selectHistoryId}/> : <MarkDownViewer content=""/> }
                    </div>
                </div>
            </div>
            <div className="flex flex-col">
                <Card
                    style={{
                        borderRadius: 0,
                        height: 60,
                        width: 300
                    }}
                    bodyStyle={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        padding: 0,
                        height: 60,
                        width: 300
                    }}
                    className="w-full h-[60px]"
                >
                    <div className="ml-2 text-base font-bold">历史记录</div>
                </Card>
                <div className="w-full h-full overflow-hidden">
                    <InfiniteScroll
                        swr={useNoteHistoryList}
                        params={{
                            noteId: id
                        }}
                        Item={HistoryListItem}
                        itemProps={{
                            selectOperationLogId: selectHistoryId,
                            setSelectOperationLogId: setSelectHistoryId,
                        }}
                        getPage={getNoteHistoryList}
                        rowHeight={60}
                    />
                </div>
            </div>
        </div>
    )
}

export default withThemeConfigProvider(NoteHistory)
