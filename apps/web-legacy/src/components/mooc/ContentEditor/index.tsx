import VditorEditor from "@/components/VditorEditor";
import {useRef} from "react";
import Vditor from "vditor";


const ContentEditor = ({
                           onInput,
                           onBlur,
                           content,
                       }: {
    onInput?: (value: string) => void,
    onBlur?: (value: string) => void,
    content?: string,
}) => {
    const vditorRef = useRef<Vditor>()

    return (
        <div className={"w-full h-full flex justify-center items-center"}>
            <div className="w-[50%] h-full">
                <VditorEditor
                    onInput={onInput}
                    onBlur={onBlur}
                    vditorRef={vditorRef}
                    content={content}
                />
            </div>
        </div>
    )
}

export default ContentEditor;
