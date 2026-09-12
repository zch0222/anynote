"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Skeleton } from "@/components/ui/skeleton";
import { useNoteQuery } from "@/features/notes/use-note";
import { PenLine } from "lucide-react";
import Link from "next/link";

/**
 * `/m/wikis/[baseId]/[noteId]`：只读阅读页。
 *
 * 桌面 `/wikis` 用组件内 `useState` 做三级导航，手机上返回键因此没有语义
 * （系统返回会直接退出整页）。这里改成真正的三级路由，每级都在历史里。
 *
 * 正文用 `preset="readonly"`：不挂工具栏、不挂交互扩展，比可写编辑器轻得多。
 * 整包仍走 `dynamic(..., { ssr: false })`（TiptapEditor 入口已处理）。
 */
export function MobileWikiReader({ baseId, noteId }: { baseId: number; noteId: number }) {
  const note = useNoteQuery(noteId);

  return (
    <MobileScreen
      title={note.data?.title ?? "阅读"}
      back={`/m/wikis/${baseId}`}
      actions={
        <Link
          href={`/m/notes/${baseId}/${noteId}`}
          aria-label="编辑这篇笔记"
          data-testid="wiki-edit-link"
          className="flex size-10 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PenLine className="size-5" aria-hidden="true" />
        </Link>
      }
      fill
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-4" data-testid="mobile-wiki-reader">
        {note.isPending ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : note.isError ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            笔记加载失败：{note.error.message}
          </p>
        ) : (
          <TiptapEditor preset="readonly" value={note.data.content ?? ""} />
        )}
      </div>
    </MobileScreen>
  );
}
