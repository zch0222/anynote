'use client'
// @ts-ignore
import { usePdf } from '@mikecousins/react-pdf';
import {useEffect, useRef} from "react";
import { PDFPageProxy } from "pdfjs-dist";

export default function PDFPage({ pdfUrl, page, scale }: {
    pdfUrl: string,
    page: number
    scale: number
}) {

    const canvasRef = useRef<HTMLCanvasElement | null>(null)

    const { pdfDocument, pdfPage } = usePdf({
        file: pdfUrl,
        page,
        canvasRef,
        scale
    });



    return (
        <div className="mt-2">
            <canvas ref={canvasRef}/>
            <div>{page}</div>
        </div>
    )
}
