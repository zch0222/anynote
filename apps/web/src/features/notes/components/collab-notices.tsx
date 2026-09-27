"use client";

import type { CollabNoteState } from "@/features/collab/use-collab-note";
import { cn } from "@/lib/utils";
import { useState } from "react";

/**
 * 服务端落库模式下的会话提示条：需刷新（4426）、笔记已删除（4404），
 * 以及谱系重建时从本地取回的尚未同步的正文（4409）。
 */
export function CollabNotices({
  collab,
  className,
}: {
  collab: Pick<CollabNoteState, "fatal" | "recoveredMarkdown" | "dismissRecovered">;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const box = "flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-footnote";

  const notices = [];
  if (collab.fatal?.kind === "outdated") {
    notices.push(
      <div
        key="outdated"
        role="alert"
        data-testid="collab-outdated"
        className={cn(box, "border-danger/30 bg-danger/5 text-danger")}
      >
        <p className="min-w-0 flex-1">编辑器版本已更新，当前页面只读。刷新页面后可以继续编辑。</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-md border border-danger/40 px-3 py-1 font-medium outline-none hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-ring"
        >
          刷新页面
        </button>
      </div>,
    );
  }
  if (collab.fatal?.kind === "deleted") {
    notices.push(
      <p
        key="deleted"
        role="alert"
        data-testid="collab-deleted"
        className={cn(box, "border-danger/30 bg-danger/5 text-danger")}
      >
        这篇笔记已被删除，当前页面只读。
      </p>,
    );
  }
  if (collab.recoveredMarkdown) {
    const markdown = collab.recoveredMarkdown;
    notices.push(
      <div
        key="recovered"
        role="alert"
        data-testid="collab-recovered"
        className={cn(box, "border-warning/30 bg-warning/5 text-warning")}
      >
        <p className="min-w-0 flex-1">
          协同会话已重建，本设备上有一段改动没能同步。请复制后手动补回正文。
        </p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(markdown).then(() => setCopied(true));
          }}
          className="shrink-0 rounded-md border border-warning/40 px-3 py-1 font-medium outline-none hover:bg-warning/10 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? "已复制" : "复制未同步的内容"}
        </button>
        <button
          type="button"
          onClick={collab.dismissRecovered}
          className="shrink-0 px-2 py-1 font-medium underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          关闭
        </button>
      </div>,
    );
  }
  if (notices.length === 0) return null;
  return <div className={cn("flex flex-col gap-2", className)}>{notices}</div>;
}
