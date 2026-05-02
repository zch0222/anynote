'use client'


export default function Wiki({params}: {
    params: {
        wikiId: number
    }
}) {

    return (
        <div>{params.wikiId}</div>
    )
}
