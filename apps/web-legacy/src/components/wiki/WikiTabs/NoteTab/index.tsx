'use client'
// import { Chip } from "@nextui-org/chip";
// import { useState } from "react";
// import { useTheme } from "next-themes";
// import {useRouter} from "next/navigation";

import useNoteList from "@/hooks/useNoteList";

import createPage from "@/components/hoc/createPage/createPage";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";

// import NoteIcon from "@/components/svg/NoteIcon";
// import { NoteInfo } from "@/types/noteTypes";
// import Pagination from "@/components/Pagination";
// import { NOTE } from "@/constants/route";
// import { stringToDateString } from "@/utils/date";
// import dayjs from "dayjs";
import InfiniteScroll from "@/components/InfiniteScroll";
import NoteItem from "@/components/note/NoteItem";
import {getNoteInfoList} from "@/requests/client/note/note";

// function NoteItem({ data }: {
//     data: NoteInfo
// }) {
//     const router = useRouter()
//
//     const [isHovered, setIsHovered] = useState(false);
//     const {theme} = useTheme()
//
//     const hoveredBg = 'light' === theme ? 'bg-[#FAFAFA]' :  'bg-[#262626]'
//
//     const getPermissions = (notePermissions: number) => {
//         if (7 === notePermissions) {
//             return <Chip color="primary">管理</Chip>
//         }
//         else if (6 === notePermissions) {
//             return <Chip color="secondary">编辑</Chip>
//         }
//         else if (4 == notePermissions) {
//             return <Chip color="warning">阅读</Chip>
//         }
//         else {
//             return <Chip color="default">无权限</Chip>
//         }
//     }
//
//     return (
//         <div
//             className={`flex h-[60px] flex-row items-center w-full justify-between p-2 cursor-pointer border-b ${isHovered ? hoveredBg : ''}`}
//             onMouseEnter={() => setIsHovered(true)}
//             onMouseLeave={() => setIsHovered(false)}
//             onClick={() => window.open(`${NOTE}/${data.id}`)}
//         >
//             <div className="flex flex-row items-center">
//                 <div className="mr-2">
//                     <NoteIcon
//                         width={24}
//                         height={45}
//                     />
//                 </div>
//                 <div className="flex flex-col select-none">
//                     <div>
//                         {data.title}
//                     </div>
//                     <div className="text-[12px] text-default-500">
//                         {`最近更新时间: ${stringToDateString(data.updateTime)}`}
//                     </div>
//                 </div>
//             </div>
//             <div className="text-white">
//                 {getPermissions(data.notePermissions)}
//             </div>
//         </div>
//     )
// }

function NoteTab({ knowledgeBaseId }: {
    knowledgeBaseId: number
}) {


    return (
        <div className="h-full pt-2 overflow-hidden">
            {/*<Pagination*/}
            {/*    direction="col"*/}
            {/*    Page={createPage(NoteItem)}*/}
            {/*    swr={useNoteList}*/}
            {/*    params={{*/}
            {/*        knowledgeBaseId: knowledgeBaseId*/}
            {/*    }}*/}
            {/*/>*/}
            <InfiniteScroll
                swr={useNoteList}
                params={{
                    knowledgeBaseId: knowledgeBaseId
                }}
                Item={NoteItem}
                rowHeight={60}
                getPage={getNoteInfoList}
            />
        </div>
    )
}

export default withThemeConfigProvider(NoteTab)
