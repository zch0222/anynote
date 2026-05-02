'use client'
import Title from "@/components/Title";
import WikiManageTabs from "@/components/wiki/manage/WikiManageTabs";


export default function MangeWiki({params}: {
    params: {
        id: number
    }
}) {
    return (
        <div className="flex flex-col overflow-hidden w-full h-full pt-10 pl-7">
            {/*<div className="text-3xl font-bold mb-5">*/}
            {/*    知识库管理*/}
            {/*</div>*/}
            <Title text="知识库管理"/>
            <div className="flex-grow overflow-hidden">
                <WikiManageTabs
                    id={params.id}
                />
            </div>

        </div>
    )
}
