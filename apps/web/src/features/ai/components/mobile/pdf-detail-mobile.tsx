"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { DocumentSkeleton } from "@/components/loading/skeletons";
import { Spinner } from "@/components/loading/spinner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatPanel } from "@/features/ai/components/chat-panel";
import { PdfViewer } from "@/features/ai/components/pdf/pdf-viewer";
import { docSessionKey } from "@/features/ai/use-chat-stream";
import { useDocIndexStatus, useDocQuery } from "@/features/ai/use-docs";
import { locatorNumber, positiveParam } from "@/lib/ai/citations";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { isDocIndexPending } from "../../doc-index-status";
import { DocIndexBadge } from "../doc-index-badge";

/**
 * `/m/ai/pdf/[docId]`：预览 / 问答两个标签页。
 *
 * 桌面三栏在 375px 下并排放不下（P0-1 的成因），移动端拆成 Tabs：
 * 预览用同一个 `PdfViewer`（宽度自适应容器），问答用同一个 `ChatPanel`
 * （每篇文档在流式 store 里独立会话，与桌面同一个 key 规则）。
 */
export function MobilePdfDetail({ docId }: { docId: number }) {
  const searchParams = useSearchParams();
  const [pageTarget, setPageTarget] = useState(() => ({
    page: positiveParam(searchParams.get("page")) ?? undefined,
    request: 0,
  }));
  const [tab, setTab] = useState("preview");
  const doc = useDocQuery(docId);
  const queryClient = useQueryClient();

  // 索引未就绪时轮询详情，完成后刷新列表徽章（与桌面同一处理）
  const indexPending = doc.isSuccess && isDocIndexPending(doc.data.indexStatus);
  const indexPoll = useDocIndexStatus(docId, { enabled: indexPending });
  useEffect(() => {
    if (indexPoll.data && !isDocIndexPending(indexPoll.data.indexStatus)) {
      queryClient.invalidateQueries({ queryKey: ["ai", "docs"] });
    }
  }, [indexPoll.data, queryClient]);

  const indexStatus = indexPoll.data?.indexStatus ?? doc.data?.indexStatus;

  return (
    <MobileScreen
      title={doc.data?.docName ?? "文档"}
      back="/m/ai/pdf"
      actions={<DocIndexBadge status={indexStatus} />}
      fill
      contentClassName="min-h-0 flex-none overflow-hidden"
    >
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as string)}
        className="flex min-h-0 flex-1 flex-col p-3"
        data-testid="mobile-pdf-detail"
      >
        <TabsList className="w-full shrink-0">
          <TabsTrigger value="preview" className="flex-1">
            预览
          </TabsTrigger>
          <TabsTrigger value="chat" className="flex-1">
            问答
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="min-h-0 flex-1 overflow-hidden pt-3">
          {doc.isPending ? (
            <DocumentSkeleton />
          ) : doc.isError ? (
            <p className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
              文档加载失败：{doc.error.message}
            </p>
          ) : doc.data.url ? (
            <PdfViewer
              url={doc.data.url}
              page={pageTarget.page}
              navigationKey={pageTarget.request}
            />
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-label-secondary">
              这篇文档还没有可预览的地址。
            </p>
          )}
        </TabsContent>

        <TabsContent value="chat" className="min-h-0 flex-1 pt-3">
          <ChatPanel
            sessionKey={docSessionKey(docId)}
            docId={docId}
            variant="mobile"
            onCitation={(citation) => {
              if (citation.sourceId !== `doc:${docId}`) return false;
              const page = locatorNumber(citation.locator?.pageStart ?? citation.locator?.pageNo);
              setPageTarget((current) => ({
                page: page && Number.isSafeInteger(page) ? page : 1,
                request: current.request + 1,
              }));
              setTab("preview");
              return true;
            }}
            emptyHint="就当前文档提问"
            placeholder="例如：这篇文档讲了什么？"
          />
        </TabsContent>
      </Tabs>
    </MobileScreen>
  );
}
