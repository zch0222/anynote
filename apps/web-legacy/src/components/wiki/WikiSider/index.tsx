'use client'
import { Card } from "antd";
import { usePathname } from "next/navigation";

import WikiSiderHeader from "./WikiSiderHeader";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import NoteList from "./NoteList";
import {useEffect, useState} from "react";

function WikiSider() {

    const [id, setId] = useState<number>(-1)

    useEffect(() => {
        const pathname = window.location.pathname
        const match = pathname.match(/\/wikis\/(\d+)/)
        setId( parseInt(match?.[1] || '-1'))
    }, [])

    const cardStyle = {
        padding: 0,
        borderRadius: 0
    }
    const bodyStyle = {
        padding: 0,
        width: "100%",
        height: "100%"
    }
    const cardClassName = "h-full flex flex-col"


    return (
        <Card
            className={cardClassName}
            style={cardStyle}
            bodyStyle={bodyStyle}
        >
            <WikiSiderHeader
                id={id}
            />
            <NoteList
                knowledgeBaseId={id}
            />

        </Card>
    )
}

export default withThemeConfigProvider(WikiSider)
