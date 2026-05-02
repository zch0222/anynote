'use client'

import useKnowledgeBase from "@/hooks/useKnowledgeBase";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider"
import Loading from "@/components/Loading";

function WikiSiderHeader({ id }: {
    id: number
}) {
    console.log("header render--------")

    const { data } = useKnowledgeBase(id)

    if (!data) {
        return <Loading size="small"/>
    }

    return (
        <div>{data.knowledgeBaseName}</div>
    )
}

export default withThemeConfigProvider(WikiSiderHeader)
