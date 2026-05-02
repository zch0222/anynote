'use client'
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import useDoc from "@/hooks/useDoc";
import Loading from "@/components/Loading";
import PDFViewer from "@/components/chat-pdf/PDFViewer";

function Doc({params}: {
    params: {
        docId: number
    }
}) {

    const { data } = useDoc(params.docId)

    if (!data) {
        return (
            <div className="w-full h-full flex justify-center items-center">
                <Loading/>
            </div>
        )
    }

    return (
        <div className="flex flex-col w-full h-full">
            <div className="flex-grow w-full">
                <PDFViewer
                    src={data.url}
                    docId={params.docId}
                    doc={data}
                />
            </div>
        </div>
    )
}

export default withThemeConfigProvider(Doc)
