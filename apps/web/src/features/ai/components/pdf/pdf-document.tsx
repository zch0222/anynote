"use client";

import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useState } from "react";

// worker 由 scripts/sync-pdf-worker.mjs 同步到 public/（自托管，不走 CDN）
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export type PdfDocumentProps = {
  url: string;
  width: number;
  onLoaded?: ((numPages: number) => void) | undefined;
};

/**
 * react-pdf 渲染器。此模块经 `dynamic(..., { ssr: false })` 加载：
 * pdfjs 依赖 DOM 与 worker，不能进 SSR 包。
 */
export function PdfDocument({ url, width, onLoaded }: PdfDocumentProps) {
  const [numPages, setNumPages] = useState(0);
  const pages = Array.from({ length: numPages }, (_, index) => index + 1);

  return (
    <Document
      file={url}
      onLoadSuccess={(pdf) => {
        setNumPages(pdf.numPages);
        onLoaded?.(pdf.numPages);
      }}
      loading={<p className="p-6 text-center text-sm text-muted-foreground">PDF 加载中…</p>}
      error={
        <p className="p-6 text-center text-sm text-destructive">
          PDF 加载失败：预览链接可能已过期，重新选择文档试试。
        </p>
      }
      className="flex flex-col items-center gap-4"
    >
      {pages.map((pageNumber) => (
        <Page key={pageNumber} pageNumber={pageNumber} width={width} />
      ))}
    </Document>
  );
}
