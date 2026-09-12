"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatPanel } from "@/features/ai/components/chat-panel";
import { PdfViewer } from "@/features/ai/components/pdf/pdf-viewer";
import { DOC_INDEXED } from "@/features/ai/schemas";
import { docSessionKey } from "@/features/ai/use-chat-stream";
import { useDocIndexStatus, useDocQuery } from "@/features/ai/use-docs";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * `/m/ai/pdf/[docId]`：预览 / 问答两个标签页。
 *
 * 桌面三栏在 375px 下并排放不下（P0-1 的成因），移动端拆成 Tabs：
 * 预览用同一个 `PdfViewer`（宽度自适应容器），问答用同一个 `ChatPanel`
 * （每篇文档在流式 store 里独立会话，与桌面同一个 key 规则）。
 */
export function MobilePdfDetail({ docId }: { docId: number }) {
  const [tab, setTab] = useState("preview");
  const doc = useDocQuery(docId);
  const queryClient = useQueryClient();

  // 索引未就绪时轮询详情，完成后刷新列表徽章（与桌面同一处理）
  const indexPending = doc.isSuccess && doc.data.indexStatus !== DOC_INDEXED;
  const indexPoll = useDocIndexStatus(docId, { enabled: indexPending });
  useEffect(() => {
    if (indexPoll.data?.indexStatus === DOC_INDEXED) {
      queryClient.invalidateQueries({ queryKey: ["ai", "docs"] });
    }
  }, [indexPoll.data, queryClient]);

  const indexed =
    doc.data?.indexStatus === DOC_INDEXED || indexPoll.data?.indexStatus === DOC_INDEXED;

  return (
    <MobileScreen
      title={doc.data?.docName ?? "文档"}
      back="/m/ai/pdf"
      actions={
        indexed ? (
          <Badge variant="secondary">已索引</Badge>
        ) : (
          <Badge variant="outline">
            <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" />
            索引中
          </Badge>
        )
      }
      fill
      contentClassName="min-h-0"
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

        <TabsContent value="preview" className="min-h-0 flex-1 overflow-y-auto pt-3">
          {doc.isPending ? (
            <Skeleton className="h-64 w-full rounded-xl" aria-busy="true" />
          ) : doc.isError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              文档加载失败：{doc.error.message}
            </p>
          ) : doc.data.url ? (
            <PdfViewer url={doc.data.url} />
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              这篇文档还没有可预览的地址。
            </p>
          )}
        </TabsContent>

        <TabsContent value="chat" className="min-h-0 flex-1 pt-3">
          <ChatPanel
            sessionKey={docSessionKey(docId)}
            docId={docId}
            emptyHint="就当前文档提问"
            placeholder="例如：这篇文档讲了什么？"
          />
        </TabsContent>
      </Tabs>
    </MobileScreen>
  );
}
