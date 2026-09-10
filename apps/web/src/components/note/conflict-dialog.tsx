"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { NoteConflict } from "@/features/notes/use-save-note";
import { diffLines, summarizeDiff } from "@/lib/notes/diff";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

const lineTone: Record<string, string> = {
  added: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  removed: "bg-destructive/10 text-destructive",
  equal: "text-muted-foreground",
};

const linePrefix: Record<string, string> = { added: "+", removed: "-", equal: " " };

/**
 * 版本冲突提示。
 *
 * M6 只展示文字差异并让用户二选一；三方合并的 UI 留到 M8。
 * 「-」是本地未保存的内容，「+」是服务端已经存在的内容。
 */
export function ConflictDialog({
  conflict,
  onResolve,
}: {
  conflict: NoteConflict | null;
  onResolve: (choice: "keepLocal" | "useServer") => void;
}) {
  const lines = useMemo(
    () => (conflict ? diffLines(conflict.local.content, conflict.server.content) : []),
    [conflict],
  );
  const summary = useMemo(() => summarizeDiff(lines), [lines]);

  return (
    <Dialog open={conflict !== null}>
      <DialogContent showCloseButton={false} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>这篇笔记已被其他会话修改</DialogTitle>
          <DialogDescription>
            服务端有 {summary.added} 行你这边没有的内容，你的改动有 {summary.removed} 行尚未保存。
            选择保留哪一份，之后再手动合并另一份。
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-72 rounded-md border">
          <pre className="p-3 font-mono text-xs leading-5">
            {lines.map((line, index) => (
              <div
                // 差异行没有天然主键，同一份 diff 内下标稳定
                key={`${line.op}-${index}-${line.text}`}
                className={cn("whitespace-pre-wrap px-1", lineTone[line.op])}
              >
                {linePrefix[line.op]} {line.text}
              </div>
            ))}
          </pre>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onResolve("useServer")}>
            放弃我的改动
          </Button>
          <Button onClick={() => onResolve("keepLocal")}>用我的改动覆盖</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
