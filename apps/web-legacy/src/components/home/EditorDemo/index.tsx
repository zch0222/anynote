'use client'
import { useRef } from "react";

import MarkDownEditor from "@/components/MarkDownEditor";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import Vditor from "vditor";


function EditorDemo() {

    const vditorRef = useRef<Vditor>()

    return (
        <div className="flex flex-col items-center w-full">
            <div
                id="noteEditor"
                className="w-full h-[100px] flex flex-col mt-[20px] mb-[20px] justify-center items-center"
                // style={{
                //     backgroundImage: `url(https://anynote.obs.cn-east-3.myhuaweicloud.com/images/home/cool-background.png)`,
                //     backgroundPosition: 'center',
                //     backgroundSize: 'cover',
                //     backgroundRepeat: 'no-repeat'
                // }}
            >
                <div className="text-3xl font-bold">
                    所见即所得的笔记编辑器
                </div>
            </div>
            <div className="w-[60%] h-[450px]">
                <MarkDownEditor
                    onInput={(value) => {}}
                    onBlur={(value: string) => {}}
                    onUpload={(files) => { return null }}
                    content={"# Hello World"}
                    vditorRef={vditorRef}
                />
            </div>
        </div>
    )
}

export default withThemeConfigProvider(EditorDemo)