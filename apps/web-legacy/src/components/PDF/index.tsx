'use client'

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {useState} from "react";
import {Document, Page} from "react-pdf";


function PDF({ src, title }: {
    src: string,
    title: string
}) {


    const [page, setPage] = useState(1)
    const [numPages , setNumPages ] = useState(0)


    return (
        <div className="w-full h-full">
            {/*<Document*/}
            {/*    file={src}*/}
            {/*    onLoadSuccess={({ numPages } ) => {*/}
            {/*        setNumPages(numPages)*/}
            {/*    }}*/}
            {/*    onItemClick={onItemClick}*/}
            {/*>*/}
            {/*    <Page className="w-[80%]" pageNumber={page} scale={scale}/>*/}
            {/*</Document>*/}


        </div>
    )
}

export default withThemeConfigProvider(PDF)
