'use client'
import DocForm from "@/components/doc/DocForm";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import Title from "@/components/Title";

function CreateDoc() {

    return (
        <div className="flex flex-col w-full h-full p-5">
            <Title text={"新建文档"}/>
            <div className="flex-grow overflow-y-auto">
                <DocForm/>
            </div>
        </div>
    )
}

export default withThemeConfigProvider(CreateDoc)