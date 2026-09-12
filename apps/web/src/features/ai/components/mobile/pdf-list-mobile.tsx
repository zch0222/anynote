"use client";

import { MobileActionSheet } from "@/components/layout/mobile/mobile-action-sheet";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DOC_INDEXED } from "@/features/ai/schemas";
import { useDeleteDocMutation, useDocsQuery, useUploadPdfMutation } from "@/features/ai/use-docs";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { ChevronDown, FileText, MoreHorizontal, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * `/m/ai/pdf`：文档列表页。
 *
 * 桌面是"文件库 / 预览 / 问答"三栏，手机上只保留第一栏，选中文档进详情页
 * （方案 D4）。上传用系统文件选择器，`accept="application/pdf"` 与桌面一致。
 *
 * ⚠️ 上传链路受 M7.6 缺口 4（PDF 转存）阻塞，这里只保证失败提示与进度可见。
 */
export function MobilePdfList() {
  const bases = useKnowledgeBasesQuery();
  const [baseId, setBaseId] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [acting, setActing] = useState<{ id: number; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const docs = useDocsQuery(baseId ?? 0);
  const upload = useUploadPdfMutation();
  const deleteDoc = useDeleteDocMutation();

  const firstBase = bases.data?.[0];
  useEffect(() => {
    if (baseId === null && firstBase) {
      setBaseId(firstBase.id);
    }
  }, [firstBase, baseId]);

  const currentBase = bases.data?.find((base) => base.id === baseId);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
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
      await upload.mutateAsync({ file, knowledgeBaseId: baseId, onProgress: setProgress });
      toast.success("上传成功，正在构建索引");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败，请稍后重试");
    } finally {
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (docId: number) => {
    if (!baseId) return;
    try {
      await deleteDoc.mutateAsync({ docId, knowledgeBaseId: baseId });
      toast.success("文档已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败，请稍后重试");
    }
  };

  return (
    <MobileScreen
      title="PDF 问答"
      back="/m/me"
      toolbar={
        <MobileActionSheet
          title="选择知识库"
          description="文档挂在知识库下。"
          actions={(bases.data ?? []).map((base) => ({
            label: base.knowledgeBaseName ?? "未命名知识库",
            onSelect: () => setBaseId(base.id),
          }))}
          trigger={
            <Button variant="outline" className="min-h-10 w-full justify-between">
              <span className="truncate">{currentBase?.knowledgeBaseName ?? "选择知识库"}</span>
              <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
            </Button>
          }
        />
      }
    >
      <div className="space-y-4 p-4" data-testid="mobile-pdf-list">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(event) => {
            void handleFiles(event.target.files);
          }}
        />
        <Button
          className="min-h-11 w-full"
          disabled={upload.isPending || !baseId}
          onClick={() => fileInputRef.current?.click()}
          data-testid="mobile-pdf-upload"
        >
          <Upload className="size-4" aria-hidden="true" />
          {upload.isPending ? "上传中…" : "上传 PDF"}
        </Button>
        {progress !== null ? (
          <div data-testid="mobile-pdf-progress">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{progress}%</p>
          </div>
        ) : null}

        {!baseId ? (
          <EmptyBox title="还没有可用的知识库" hint="文档挂在知识库下，先到笔记页创建一个。" />
        ) : docs.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        ) : docs.isError ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            文档加载失败：{docs.error.message}
          </p>
        ) : (docs.data?.rows.length ?? 0) === 0 ? (
          <EmptyBox title="还没有文档" hint="上传一个 PDF，就能围绕它提问。" />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {docs.data?.rows.map((row) => (
              <li key={row.id} className="flex items-center" data-testid={`doc-item-${row.id}`}>
                <Link
                  href={`/m/ai/pdf/${row.id}`}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-sm outline-none focus-visible:bg-accent"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{row.docName ?? "未命名文档"}</span>
                  <Badge variant={row.indexStatus === DOC_INDEXED ? "secondary" : "outline"}>
                    {row.indexStatus === DOC_INDEXED ? "已索引" : "未索引"}
                  </Badge>
                </Link>
                <button
                  type="button"
                  aria-label={`「${row.docName ?? "未命名文档"}」的操作`}
                  onClick={() => setActing({ id: row.id, name: row.docName ?? "未命名文档" })}
                  className="flex size-11 shrink-0 items-center justify-center text-muted-foreground outline-none focus-visible:bg-accent"
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {acting ? (
        <MobileActionSheet
          open
          onOpenChange={(next) => {
            if (!next) setActing(null);
          }}
          title={acting.name}
          actions={[
            {
              label: "删除文档",
              icon: Trash2,
              destructive: true,
              confirm: "再点一次确认删除",
              disabled: deleteDoc.isPending,
              onSelect: () => {
                void handleDelete(acting.id);
                setActing(null);
              },
            },
          ]}
        />
      ) : null}
    </MobileScreen>
  );
}

function EmptyBox({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center">
      <FileText className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}
