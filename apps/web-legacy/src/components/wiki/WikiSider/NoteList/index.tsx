'use client'
import { Chip } from "@nextui-org/chip";
import {useCallback, useState} from "react";
import { useTheme } from "next-themes";
import {useRouter} from "next/navigation";

import useNoteList from "@/hooks/useNoteList";

import createPage from "@/components/hoc/createPage/createPage";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";

import NoteIcon from "@/components/svg/NoteIcon";
import { NoteInfo } from "@/types/noteTypes";
import InfiniteScroll from "@/components/InfiniteScroll";
import {NOTE, WIKIS} from "@/constants/route";
import {id} from "postcss-selector-parser";


function NoteItem({ data, itemProps }: {
    data: NoteInfo,
    itemProps?: {
        knowledgeBaseId: number
    }
}) {
    const router = useRouter()

    const [isHovered, setIsHovered] = useState(false);
    const {theme} = useTheme()

    const hoveredBg = 'light' === theme ? 'bg-[#FAFAFA]' :  'bg-[#262626]'

    const getPermissions = (notePermissions: number) => {
        if (7 === notePermissions) {
            return <Chip color="primary">管理</Chip>
        }
        else if (6 === notePermissions) {
            return <Chip color="secondary">编辑</Chip>
        }
        else if (4 == notePermissions) {
            return <Chip color="warning">阅读</Chip>
        }
        else {
            return <Chip color="default">无权限</Chip>
        }
    }

    return (
        <div
            className={`flex min-h-[8vh] flex-col w-full justify-between p-2 cursor-pointer border-b ${isHovered ? hoveredBg : ''}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => {
                router.push(`/wikis/${itemProps?.knowledgeBaseId}/note/${data.id}`)
            }}
        >
            <div className={`select-none`}>
                {data.title}
            </div>

        </div>
    )
}
function NoteTab({ knowledgeBaseId }: {
    knowledgeBaseId: number
}) {

    const [selectedNoteId, setSelectedNoteId] = useState<number>(-1)



    return (
        <div className="flex-grow pt-2 overflow-hidden">
            <InfiniteScroll
                swr={useNoteList}
                params={{
                    knowledgeBaseId: knowledgeBaseId
                }}
                Item={NoteItem}
                itemProps={{
                    knowledgeBaseId: knowledgeBaseId
                }}
            />
        </div>
    )
}

export default withThemeConfigProvider(NoteTab)
