"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { DOC_INDEXED } from "@/features/ai/schemas";
import { docSessionKey } from "@/features/ai/use-chat-stream";
import {
  useDeleteDocMutation,
  useDocIndexStatus,
  useDocQuery,
  useDocsQuery,
  useUploadPdfMutation,
} from "@/features/ai/use-docs";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChatPanel } from "../chat-panel";
import { PdfViewer } from "./pdf-viewer";

/** 小屏（< lg）一次只显示一个面板，用顶部切换控件在两者之间来回。 */
type PdfPane = "docs" | "chat";

/**
 * Chat PDF：左侧文档库（选知识库 → 上传/列表），中间 PDF 预览，右侧文档问答。
 * 上传链路：multipart 直传 note 服务 → 自动触发 RAG 索引（异步）→ 轮询索引状态。
 *
 * 版式：`lg` 以上是三栏；`lg` 以下预览栏隐藏，文档库与问答**不并排**，
 * 由 `pane` 决定显示哪一个——两者并排时宽度之和恒大于手机视口，会把整页顶出横向滚动条。
 */
export function PdfChatPage() {
  const bases = useKnowledgeBasesQuery();
  const [baseId, setBaseId] = useState<number | null>(null);
  const [docId, setDocId] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [pane, setPane] = useState<PdfPane>("docs");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const firstBase = bases.data?.[0];
  useEffect(() => {
    if (baseId === null && firstBase) {
      setBaseId(firstBase.id);
    }
  }, [firstBase, baseId]);

  const docs = useDocsQuery(baseId ?? 0);
  const doc = useDocQuery(docId ?? 0);
  const upload = useUploadPdfMutation();
  const deleteDoc = useDeleteDocMutation();

  // 索引未就绪时轮询详情，完成后刷新列表徽章
  const indexPending = Boolean(docId) && doc.isSuccess && doc.data.indexStatus !== DOC_INDEXED;
  const indexPoll = useDocIndexStatus(docId ?? 0, { enabled: indexPending });
  useEffect(() => {
    if (indexPoll.data?.indexStatus === DOC_INDEXED) {
      queryClient.invalidateQueries({ queryKey: ["ai", "docs"] });
    }
  }, [indexPoll.data, queryClient]);

  const currentBase = bases.data?.find((base) => base.id === baseId);
  const indexed =
    doc.data?.indexStatus === DOC_INDEXED || indexPoll.data?.indexStatus === DOC_INDEXED;

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) {
      return;
    }
    if (!baseId) {
      toast.error("请先选择知识库");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("只支持 PDF 文件");
      return;
    }
    try {
      setProgress(0);
      const createdId = await upload.mutateAsync({
        file,
        knowledgeBaseId: baseId,
        onProgress: setProgress,
      });
      setDocId(createdId);
      toast.success("上传成功，正在构建索引");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败，请稍后重试");
    } finally {
      setProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteDoc = async (target: number) => {
    if (!baseId || !window.confirm("删除后无法恢复，确认删除这篇文档？")) {
      return;
    }
    try {
      await deleteDoc.mutateAsync({ docId: target, knowledgeBaseId: baseId });
      if (docId === target) {
        setDocId(null);
      }
      toast.success("文档已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败，请稍后重试");
    }
  };

  return (
    <div
      className="flex h-[calc(100svh-9rem)] min-h-0 flex-col lg:flex-row"
      data-testid="pdf-chat-page"
    >
      <div
        role="tablist"
        aria-label="文档库与问答切换"
        className="flex shrink-0 gap-1 border-b p-2 lg:hidden"
        data-testid="pdf-pane-switch"
      >
        {(
          [
            ["docs", "文档库"],
            ["chat", "问答"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={pane === key}
            onClick={() => {
              setPane(key);
            }}
            className={cn(
              "min-h-10 flex-1 rounded-lg px-3 text-sm transition-colors",
              pane === key ? "bg-accent text-accent-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <aside
        data-testid="pdf-pane-docs"
        className={cn(
          "flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 p-3 lg:w-72 lg:flex-none lg:shrink-0 lg:border-r",
          pane !== "docs" && "hidden lg:flex",
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" className="w-full justify-between" />}
          >
            <span className="truncate">{currentBase?.knowledgeBaseName ?? "选择知识库"}</span>
            <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">
            {bases.isPending ? (
              <div className="p-2">
                <Skeleton className="h-8" />
              </div>
            ) : (
              bases.data?.map((base) => (
                <DropdownMenuItem
                  key={base.id}
                  onSelect={() => {
                    setBaseId(base.id);
                    setDocId(null);
                  }}
                >
                  <span className="truncate">{base.knowledgeBaseName ?? "未命名知识库"}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(event) => {
            void handleFiles(event.target.files);
          }}
        />
        <div
          className="rounded-xl border border-dashed p-4 text-center"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            void handleFiles(event.dataTransfer.files);
          }}
          data-testid="pdf-upload-zone"
        >
          <Upload className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-sm">拖拽 PDF 到此处，或</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            disabled={upload.isPending || !baseId}
            onClick={() => {
              fileInputRef.current?.click();
            }}
            data-testid="pdf-upload-button"
          >
            {upload.isPending ? "上传中…" : "选择文件"}
          </Button>
          {progress !== null ? (
            <div className="mt-3" data-testid="pdf-upload-progress">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{progress}%</p>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto" data-testid="doc-list">
          {docs.isPending ? (
            [0, 1, 2].map((item) => <Skeleton key={item} className="h-12 rounded-lg" />)
          ) : docs.isError ? (
            <p className="p-2 text-sm text-destructive">文档加载失败：{docs.error.message}</p>
          ) : (docs.data?.rows.length ?? 0) === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">还没有文档，先上传一个 PDF。</p>
          ) : (
            docs.data?.rows.map((row) => (
              <div
                key={row.id}
                className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
                  row.id === docId ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                }`}
                data-testid={`doc-item-${row.id}`}
              >
                <button
                  type="button"
                  className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-2 text-left outline-none"
                  onClick={() => {
                    setDocId(row.id);
                    // 小屏选中文档后直接进问答：预览栏在这个宽度下不显示，停在列表没有下一步
                    setPane("chat");
                  }}
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate" title={row.docName ?? "未命名文档"}>
                    {row.docName ?? "未命名文档"}
                  </span>
                </button>
                {row.indexStatus === DOC_INDEXED ? (
                  <Badge variant="secondary" className="shrink-0">
                    已索引
                  </Badge>
                ) : row.id === docId && indexPending ? (
                  <Loader2
                    className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                    aria-label="索引构建中"
                  />
                ) : (
                  <Badge variant="outline" className="shrink-0">
                    未索引
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  // 触摸端没有 hover：md 以下常显，md 以上才保持原来的「悬停才出现」
                  className="size-8 shrink-0 md:size-6 md:opacity-0 md:group-hover:opacity-100"
                  aria-label={`删除「${row.docName ?? "未命名文档"}」`}
                  disabled={deleteDoc.isPending}
                  onClick={() => {
                    void handleDeleteDoc(row.id);
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="hidden min-w-0 flex-1 flex-col lg:flex">
        {docId && doc.data?.url ? (
          <>
            <div className="flex items-center gap-2 border-b px-4 py-2 text-sm">
              <span className="truncate font-medium" title={doc.data.docName ?? ""}>
                {doc.data.docName ?? "未命名文档"}
              </span>
              {indexed ? (
                <Badge variant="secondary">已索引</Badge>
              ) : (
                <Badge variant="outline">
                  <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" />
                  索引构建中
                </Badge>
              )}
            </div>
            <div className="min-h-0 flex-1 bg-muted/30 p-4">
              <PdfViewer url={doc.data.url} />
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            选择左侧文档预览，或上传一个 PDF。
          </div>
        )}
      </section>

      <div
        data-testid="pdf-pane-chat"
        className={cn(
          "flex min-h-0 w-full min-w-0 flex-1 flex-col lg:w-96 lg:min-w-72 lg:flex-none lg:shrink-0 lg:border-l",
          pane !== "chat" && "hidden lg:flex",
        )}
      >
        {docId ? (
          <DocChatPanel docId={docId} />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            上传并选中 PDF 后，可以就文档内容提问。
          </div>
        )}
      </div>
    </div>
  );
}

function DocChatPanel({ docId }: { docId: number }) {
  // 文档问答沿用后端会话模型：每篇文档在流式 store 里独立会话，首条消息由后端建会话。
  return (
    <ChatPanel
      sessionKey={docSessionKey(docId)}
      docId={docId}
      emptyHint="就当前文档提问"
      placeholder="例如：这篇文档讲了什么？"
    />
  );
}
