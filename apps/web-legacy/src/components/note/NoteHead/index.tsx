'use client'
// import { Card } from "@nextui-org/react";
import { Button } from "antd";
import Back from "@/components/svg/Back";
import { PicLeftOutlined } from "@ant-design/icons";
import DrawerIcon from "@/components/svg/DrawerIcon";
import { useRouter } from "next/navigation";

function NoteHead({ title, updateTime, onShowDrawer, editorType, setEditorType }: {
    title: string,
    updateTime: string,
    onShowDrawer: () => void,
    editorType?: number
    setEditorType?: (newEditorType: number) => void
}) {

    const router = useRouter()

    return (
        <div
            className="px-2 flex flex-row justify-between items-center w-full h-[60px] select-none"
        >
            <div
                className="flex flex-row items-center"
            >
                {/*<div*/}
                {/*    className="ml-2 mr-2 cursor-pointer"*/}
                {/*    onClick={() => router.back()}*/}
                {/*>*/}
                {/*    <Back width={40} height={40}/>*/}
                {/*</div>*/}
                <div className="flex flex-col">
                    <div className="text-xl font-bold">
                        {title}
                    </div>
                    <div className="text-sm text-gray-500">
                        {updateTime}
                    </div>
                </div>
            </div>
            <div>
                {/*<Button*/}
                {/*    type="primary"*/}
                {/*    onClick={() => setEditorType(editorType == 0 ? 1 : 0)}*/}
                {/*>*/}
                {/*    {editorType === 0 ? "返回旧版" : "体验新版"}*/}
                {/*</Button>*/}
                {/*<Card*/}
                {/*    className="flex justify-center items-center w-[45px] h-[30px]"*/}
                {/*    radius="sm"*/}
                {/*    isPressable*/}
                {/*    onClick={onShowDrawer}*/}
                {/*>*/}
                {/*    <PicLeftOutlined style={{fontSize: 20}}/>*/}
                {/*</Card>*/}
                <Button
                    size="middle"
                    onClick={onShowDrawer}
                    icon={<PicLeftOutlined/>}
                >
                </Button>
            </div>
        </div>
    )
}

export default NoteHead
