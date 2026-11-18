"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { activitySummary, toolAction, toolResultSummary } from "@/lib/ai/process";
import type { ProcessItem, ProcessState } from "@/lib/ai/process";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * 运行过程区：整轮控件、思考行、工具行与过程说明。
 *
 * @author 称霸幼儿园
 */
export function ProcessArea({
  process,
  streaming,
  durationMs,
  failed,
  cancelled,
}: {
  process: ProcessState;
  streaming: boolean;
  durationMs?: number | undefined;
  failed?: boolean | undefined;
  cancelled?: boolean | undefined;
}) {
  const items = process.items;
  const rootRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!streaming) {
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [streaming]);

  const collapsedByDefault = !streaming && !failed && !cancelled && items.length > 0;
  useEffect(() => {
    if (!collapsedByDefault) {
      setCollapsed(false);
      return;
    }
    const root = rootRef.current;
    // 自动收起会藏住键盘焦点时不收起。
    if (root?.contains(root.ownerDocument.activeElement)) {
      return;
    }
    setCollapsed(true);
  }, [collapsedByDefault]);

  const head = streaming
    ? `思考中 · ${elapsedSeconds} 秒`
    : failed
      ? "失败"
      : cancelled
        ? "已停止"
        : `已完成，用时 ${Math.round((durationMs ?? 0) / 1000)} 秒`;
  const summary = streaming ? null : activitySummary(items);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      className="rounded-lg border border-separator/60 bg-block/60"
      data-testid="process-area"
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-label-secondary"
        data-testid="process-toggle"
      >
        {collapsed ? (
          <ChevronRight aria-hidden="true" className="size-3.5" />
        ) : (
          <ChevronDown aria-hidden="true" className="size-3.5" />
        )}
        <span>{head}</span>
        {summary ? <span className="min-w-0 truncate">· {summary}</span> : null}
        {streaming ? (
          <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        ) : null}
      </button>
      {collapsed ? null : (
        <ul className="space-y-1 px-3 pb-3">
          {items.map((item, index) => (
            <ProcessRow key={processRowKey(item, index)} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 过程区中的一行。
 *
 * @param item 过程行
 *
 * @author 称霸幼儿园
 */
function ProcessRow({ item }: { item: ProcessItem }) {
  if (item.type === "reasoning") {
    return <ReasoningRow item={item} />;
  }
  if (item.type === "retry") {
    return (
      <li
        className="flex items-center gap-2 py-1 text-xs text-label-secondary"
        data-testid="process-retry"
      >
        <span className="text-warning">↻</span>
        <span>模型连接中断，已重试</span>
      </li>
    );
  }
  if (item.type === "note") {
    return (
      <li
        className="py-1 text-xs whitespace-pre-wrap text-label-secondary"
        data-testid="process-note"
      >
        {item.text}
      </li>
    );
  }
  return <ToolRow item={item} />;
}

/**
 * 思考行：默认收起，预览原文首行；展开后块结束时用 aiAnswer 渲染。
 *
 * @param item 思考行
 *
 * @author 称霸幼儿园
 */
function ReasoningRow({ item }: { item: Extract<ProcessItem, { type: "reasoning" }> }) {
  const [open, setOpen] = useState(false);
  const firstLine = firstNonEmptyLine(item.text);
  return (
    <li className="py-0.5" data-testid="process-reasoning">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-start gap-2 text-left text-xs text-label-secondary"
      >
        {open ? (
          <ChevronDown aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        ) : (
          <ChevronRight aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        )}
        <span className="shrink-0">思考</span>
        {open ? null : <span className="min-w-0 flex-1 truncate">{firstLine ?? "…"}</span>}
      </button>
      {open ? (
        item.status === "streaming" ? (
          <p className="mt-1 ml-5 max-h-48 overflow-y-auto rounded bg-fill/60 px-2 py-1.5 text-xs leading-relaxed whitespace-pre-wrap">
            {item.text}
          </p>
        ) : (
          <ProcessMarkdown text={item.text} />
        )
      ) : null}
    </li>
  );
}

/**
 * 工具行：动作、对象、结果摘要；展开列出结果条目。
 *
 * @param item 工具行
 *
 * @author 称霸幼儿园
 */
function ToolRow({ item }: { item: Extract<ProcessItem, { type: "tool" }> }) {
  const summary = toolResultSummary(item.name, item.result);
  const entries = item.result?.items ?? [];
  const [open, setOpen] = useState(false);
  return (
    <li className="py-0.5" data-testid="process-tool">
      <button
        type="button"
        aria-expanded={open || undefined}
        onClick={() => setOpen((prev) => !prev)}
        disabled={entries.length === 0}
        className="flex w-full items-center gap-2 text-left text-xs text-label-secondary disabled:cursor-default"
      >
        <span className="shrink-0 text-accent">◆</span>
        <span className="shrink-0">{toolAction(item.name)}</span>
        {item.target ? <span className="min-w-0 truncate">· {item.target.label}</span> : null}
        {item.status === "running" ? (
          <span className="ml-auto inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        ) : (
          <span className="ml-auto shrink-0">
            {summary ? `${summary}${entries.length > 0 ? " ·" : ""}` : null}
          </span>
        )}
      </button>
      {open && entries.length > 0 ? (
        <ul className="mt-1 ml-5 space-y-0.5" data-testid="process-tool-items">
          {entries.map((entry, index) => (
            <li key={`${entry.ref ?? "item"}-${index}`} className="text-xs text-label-secondary">
              <span className="truncate">
                {entry.title || "未找到或无权访问的内容"}
                {entry.kbName ? ` · ${entry.kbName}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * 块结束后的 Markdown 渲染（流式期间由 ReasoningRow 用纯文本预览）。
 *
 * @param text Markdown 文本
 *
 * @author 称霸幼儿园
 */
function ProcessMarkdown({ text }: { text: string }) {
  return (
    <div className="mt-1 ml-5 max-h-48 overflow-y-auto rounded bg-fill/60 px-2 py-1.5 text-xs leading-relaxed [&_.tiptap]:text-xs">
      <TiptapEditor preset="aiAnswer" value={text} className="border-0" />
    </div>
  );
}

function firstNonEmptyLine(text: string): string | null {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

/**
 * 生成过程行的稳定键：有标识用标识，无标识回退序号。
 *
 * @param item 过程行
 * @param index 行序号
 * @returns React key
 */
function processRowKey(item: ProcessItem, index: number): string {
  if (item.type === "reasoning") return `reasoning-${item.blockId}-${index}`;
  if (item.type === "tool") return `tool-${item.callId}-${index}`;
  return `${item.type}-${index}`;
}
