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

function ChatText({ text, role }: {
    text: string,
    role: string
}) {

    const dispatch = useDispatch()


    const onCopyClick = () => {
        copyToClipboard(text).then(res => {
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

    if (role === "bot") {
        return (
            <div className="w-full flex flex-row mb-5">
                <div className="mr-2">
                    <Bot width={40} height={40}/>
                </div>
                <div className="flex-grow flex flex-col">
                    <div>Bot</div>
                    <Card
                        className="flex flex-col w-[85%] p-3 mt-1"
                        radius="sm"
                    >
                        <MarkDownViewer content={text}/>
                        <Button
                            className="w-[50px]"
                            variant="light"
                            color="primary"
                            onClick={onCopyClick}
                        >
                            复制
                        </Button>
                    </Card>
                </div>
            </div>
        )
    }
    else {
        return (
            <div className="w-full flex flex-row justify-end mb-5">

                <div className="flex-grow flex flex-col items-end">
                    <div className="font-blod">User</div>
                    <Card
                        className="flex flex-col w-[85%] p-3 mt-1"
                        radius="sm"
                    >
                        <MarkDownViewer content={text}/>
                        <Button
                            className="w-[50px]"
                            variant="light"
                            color="primary"
                            onClick={onCopyClick}
                        >
                            复制
                        </Button>
                    </Card>
                </div>
                <Avatar
                    className="ml-2"
                />
            </div>
        )
    }
}

export default withThemeConfigProvider(ChatText)
