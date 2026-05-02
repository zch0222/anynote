'use client'
import { useSearchParams } from "next/navigation";

import PDFViewer from "@/components/chat-pdf/PDFViewer";

export default function PDFView({params}: {
    params: {
        url: string
    }
}) {

    const searchParam = useSearchParams()
    const url = searchParam.get("url") || ""

    return (
        <div className="flex w-full h-full">
            <PDFViewer src={url}/>
        </div>
    )
}

