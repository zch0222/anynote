'use client'
import { Avatar, Card } from "@nextui-org/react";
import { Button } from "@nextui-org/react";

import MarkDownViewer from "@/components/MarkDownViewer";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import MarkDownEditor from "@/components/MarkDownEditor";
import Bot from "@/components/svg/Bot"
import { copyToClipboard } from "@/utils/copyUtil";
import { useDispatch } from "react-redux";
import { showMessage } from "@/store/message/messageSlice";

function ChatText({data, status}: {
    data: {
        id: string,
        content: string,
        role: number,
        updateTime: string
    },
    status?: string,
    key: string
}) {

    const dispatch = useDispatch()

    const { id, content, role, updateTime } = data


    const onCopyClick = () => {
        copyToClipboard(content).then(res => {
            dispatch(showMessage({
                type: "success",
                content: "复制成功"
            }))
        }).catch(
            e => {
                console.log(e)
                dispatch(showMessage({
                    type: "error",
                    content: "复制失败"
                }))
            }
        )
    }

    if (role === 1) {
        return (
            <div className="w-full flex flex-row mb-5 pt-2">
                {/*<div className="flex flex-row">*/}
                {/*    <Bot width={40} height={40}/>*/}
                {/*</div>*/}
                <div className="w-[50px]">
                    <Bot width={32} height={32}/>
                </div>
                <div className="flex flex-col flex-grow ml-2 mt-2 overflow-x-hidden">
                    <div
                        className="flex flex-row items-center"
                    >
                        {
                            "running" !== status ? <></> :
                                <div className="text-sm text-gray-400">
                                    回答生成中...
                                </div>
                        }
                    </div>
                    <div
                        className="flex flex-col w-full"
                    >
                        <MarkDownViewer content={content}/>
                        <Button
                            className="w-[50px]"
                            variant="light"
                            color="primary"
                            onClick={onCopyClick}
                        >
                            复制
                        </Button>
                        {/*<Card*/}
                        {/*    className="flex flex-col w-full p-3 mt-1"*/}
                        {/*    radius="sm"*/}
                        {/*>*/}
                        {/*    */}
                        {/*</Card>*/}
                        <div
                            className="text-sm text-gray-400 mt-1"
                        >
                            {updateTime}
                        </div>
                    </div>
                </div>
            </div>
        )
    } else {
        return (
            <div className="w-full flex flex-row justify-end mb-5">

                <div className="flex-grow w-full flex flex-col items-end">
                    {/*<div className="font-blod">User</div>*/}
                    <Card
                        className="flex flex-col w-[85%] p-3 mt-1 mr-2"
                        radius="sm"
                    >
                        <MarkDownViewer content={content}/>
                        <div className="flex flex-row h-[40px]">
                            <Button
                                className="w-[50px]"
                                variant="light"
                                size="sm"
                                color="primary"
                                onClick={onCopyClick}
                            >
                                复制
                            </Button>
                        </div>
                    </Card>
                    <div
                        className="text-sm text-gray-400 mt-1"
                    >
                        {updateTime}
                    </div>
                </div>
                {/*<Avatar*/}
                {/*    className="ml-2"*/}
                {/*/>*/}
            </div>
        )
    }
}

export default withThemeConfigProvider(ChatText)
