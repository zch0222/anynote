'use client'
import {Card} from "@nextui-org/react";
import useNoteHistory from "@/hooks/useNoteHistory";

import MarkDownViewer from "@/components/MarkDownViewer";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import Loading from "@/components/Loading";


function HistoryContent({operationId}: {
    operationId: number
}) {

    const { data } = useNoteHistory({
        operationId: operationId
    })


    if (!data) {
        return (
            <div className="flex justify-center items-center w-full h-full">
                <Loading/>
            </div>
        )
    }


    return (
        <MarkDownViewer content={data.content}/>
    )
}

export default withThemeConfigProvider(HistoryContent)
