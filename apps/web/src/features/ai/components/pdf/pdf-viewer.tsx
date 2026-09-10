"use client";

import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// pdfjs 不能进 SSR 包，与 TiptapEditor 同样的懒加载策略
const PdfDocument = dynamic(() => import("./pdf-document").then((mod) => mod.PdfDocument), {
  ssr: false,
  loading: () => (
    <div className="space-y-3 p-6">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  ),
});

export type PdfViewerProps = {
  url: string;
  onLoaded?: (numPages: number) => void;
};

/** PDF 预览面板：宽度跟随容器，滚动翻页。 */
export function PdfViewer({ url, onLoaded }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const update = () => {
      setWidth(Math.max(320, Math.min(element.clientWidth - 32, 900)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="h-full overflow-y-auto" data-testid="pdf-viewer">
      <PdfDocument url={url} width={width} onLoaded={onLoaded} />
    </div>
  );
}
