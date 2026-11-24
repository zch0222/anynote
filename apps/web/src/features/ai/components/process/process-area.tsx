"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { shouldHandleSidePanelClick, useSidePanelLink } from "@/features/side-panel/link-context";
import { type CitationVariant, citationHref } from "@/lib/ai/citations";
import { completedHead, toolAction, toolTrailing } from "@/lib/ai/process";
import type { ProcessItem, ProcessResultItem, ProcessState } from "@/lib/ai/process";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const UNREADABLE_TITLE = "未找到或无权访问的内容";

/**
 * 运行过程区：整轮控件、思考行、工具行与过程说明。
 *
 * @author 称霸幼儿园
 */
export function ProcessArea({
  process,
  streaming,
  durationMs,
  toolCalls,
  firstOutputMs,
  failed,
  cancelled,
  variant = "desktop",
  presentation = "document",
}: {
  process: ProcessState;
  streaming: boolean;
  durationMs?: number | undefined;
  toolCalls?: number | undefined;
  firstOutputMs?: number | undefined;
  failed?: boolean | undefined;
  cancelled?: boolean | undefined;
  variant?: CitationVariant | undefined;
  presentation?: "document" | "conversation" | undefined;
}) {
  const items = process.items;
  const rootRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);
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

  const status = failed
    ? "失败"
    : cancelled
      ? "已停止"
      : completedHead(durationMs, firstOutputMs, toolCalls, items);
  const head = streaming ? `思考中 · ${elapsedSeconds} 秒` : status;
  // 移动端运行中只显示整轮控件和最新一行，点按展开全部。
  const latestOnly = variant === "mobile" && streaming && !showAll;
  const visibleItems = latestOnly ? items.slice(-1) : items;

  if (items.length === 0) {
    return null;
  }

  const toggle = () => {
    if (variant === "mobile" && streaming) {
      setShowAll((prev) => !prev);
      return;
    }
    setCollapsed((prev) => !prev);
  };
  const expanded = latestOnly ? false : !collapsed;

  return (
    <div
      ref={rootRef}
      className={cn(
        "rounded-lg border",
        presentation === "conversation"
          ? "border-separator bg-background"
          : "border-separator/60 bg-block/60",
      )}
      data-testid="process-area"
    >
      <span className="sr-only" aria-live="polite" data-testid="process-announcer">
        {streaming ? "思考中" : status}
      </span>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-label-secondary"
        data-testid="process-toggle"
      >
        {expanded ? (
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
        )}
        <span className="min-w-0 truncate">{head}</span>
        {streaming ? (
          <span
            aria-hidden="true"
            className="ml-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent motion-safe:animate-pulse"
            data-testid="process-pulse"
          />
        ) : null}
      </button>
      {collapsed && !latestOnly ? null : (
        <ul className="space-y-1 px-3 pb-3">
          {visibleItems.map((item, index) => (
            <ProcessRow key={processRowKey(item, index)} item={item} variant={variant} />
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
 * @param variant 桌面或移动端
 *
 * @author 称霸幼儿园
 */
function ProcessRow({ item, variant }: { item: ProcessItem; variant: CitationVariant }) {
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
  return <ToolRow item={item} variant={variant} />;
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
 * 工具行：动作、对象、结果摘要或失败标识、耗时；展开列出结果条目，条目链接沿用引用卡片的路由。
 *
 * @param item 工具行
 * @param variant 桌面或移动端
 *
 * @author 称霸幼儿园
 */
function ToolRow({
  item,
  variant,
}: {
  item: Extract<ProcessItem, { type: "tool" }>;
  variant: CitationVariant;
}) {
  const trailing = toolTrailing(item);
  const entries = item.result?.items ?? [];
  const [open, setOpen] = useState(false);
  const failed = item.status === "FAILED";
  return (
    <li className="py-0.5" data-testid="process-tool" data-status={item.status}>
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
          <span
            aria-hidden="true"
            className="ml-auto inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent motion-safe:animate-pulse"
            data-testid="process-tool-pulse"
          />
        ) : trailing ? (
          <span
            className={`ml-auto shrink-0 ${failed ? "text-danger" : ""}`}
            data-testid="process-tool-trailing"
          >
            {trailing}
          </span>
        ) : null}
      </button>
      {open && entries.length > 0 ? (
        <ul className="mt-1 ml-5 space-y-0.5" data-testid="process-tool-items">
          {entries.map((entry, index) => (
            <ResultEntry key={`${entry.ref ?? "item"}-${index}`} entry={entry} variant={variant} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * 工具结果条目：能生成站内链接时可点击，链接沿用引用卡片的桌面与移动端路由。
 *
 * @param entry 结果条目
 * @param variant 桌面或移动端
 *
 * @author 称霸幼儿园
 */
function ResultEntry({ entry, variant }: { entry: ProcessResultItem; variant: CitationVariant }) {
  const open = useSidePanelLink();
  const href = entry.ref
    ? citationHref(
        {
          index: 1,
          sourceType: entry.ref.split(":", 1)[0] ?? "",
          sourceId: entry.ref,
          kbId: entry.kbId ?? null,
          locator: entry.locator ?? null,
        },
        variant,
      )
    : null;
  const title = entry.title || UNREADABLE_TITLE;
  return (
    <li className="group/item flex min-w-0 items-center gap-1 text-xs text-label-secondary">
      {href ? (
        <Link
          href={href}
          prefetch={false}
          className="min-w-0 truncate text-accent hover:underline"
          data-testid="process-tool-item-link"
          onClick={(event) => {
            if (!open || !shouldHandleSidePanelClick(event)) return;
            event.preventDefault();
            open({ kind: "tool", entry }, { focus: event.detail === 0 });
          }}
        >
          {title}
        </Link>
      ) : (
        <span className="min-w-0 truncate">{title}</span>
      )}
      {entry.kbName ? <span className="shrink-0">{` · ${entry.kbName}`}</span> : null}
      {open && href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          data-side-panel-new-window
          aria-label={`在新窗口打开「${title}」`}
          title={`在新窗口打开「${title}」`}
          className="shrink-0 rounded-sm p-0.5 text-label-tertiary opacity-0 transition-opacity outline-none hover:text-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/item:opacity-100 [@media(pointer:coarse)]:opacity-100"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
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
 * 生成过程行的稳定键：类型加行标识，无标识回退序号。
 *
 * @param item 过程行
 * @param index 行序号
 * @returns React key
 */
function processRowKey(item: ProcessItem, index: number): string {
  return item.id ? `${item.type}-${item.id}` : `${item.type}-${index}`;
}
