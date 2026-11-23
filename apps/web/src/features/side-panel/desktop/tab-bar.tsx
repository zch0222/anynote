"use client";

import { Button } from "@/components/ui/button";
import type { ResourceHint } from "@/lib/ai/resource-target";
import { cn } from "@/lib/utils";
import { Maximize2, Minimize2, PanelRightClose, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { getTabDefinition } from "../registry";
import { useSidePanelStore } from "../store";
import { UNREADABLE_TITLE } from "../tabs/shared";
import type { TabId, TabRecord } from "../types";
import { tabDomId, tabPanelId } from "./ids";

/**
 * 桌面侧栏的标签条：标签、关闭、最大化与收起。
 *
 * @author 称霸幼儿园
 */

export type TabBarProps = {
  surface: string;
  tabs: TabRecord[];
  activeId: TabId | null;
  hints: Record<string, ResourceHint>;
  canMaximize: boolean;
  maximized: boolean;
  onToggleMaximized: () => void;
  onCollapse: () => void;
};

export function TabBar({
  surface,
  tabs,
  activeId,
  hints,
  canMaximize,
  maximized,
  onToggleMaximized,
  onCollapse,
}: TabBarProps) {
  const activate = useSidePanelStore((state) => state.activate);
  const close = useSidePanelStore((state) => state.close);
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [],
    );
    if (buttons.length === 0) return;
    const currentIndex = buttons.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + delta + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
    event.preventDefault();
  };

  return (
    <div
      data-side-panel-bar
      className="flex h-14 shrink-0 items-center gap-1 border-b border-separator px-2"
    >
      <div
        ref={listRef}
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={handleKeyDown}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      >
        {tabs.map((record) => (
          <TabButton
            key={record.id}
            surface={surface}
            record={record}
            hint={hints[record.id]}
            active={record.id === activeId}
            onActivate={() => activate(surface, record.id)}
            onClose={() => close(surface, record.id)}
          />
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {canMaximize ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={maximized ? "还原" : "最大化"}
            title={maximized ? "还原" : "最大化"}
            onClick={onToggleMaximized}
          >
            {maximized ? (
              <Minimize2 className="size-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="size-4" aria-hidden="true" />
            )}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="收起右侧栏"
          title="收起右侧栏"
          onClick={onCollapse}
        >
          <PanelRightClose className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function TabButton({
  surface,
  record,
  hint,
  active,
  onActivate,
  onClose,
}: {
  surface: string;
  record: TabRecord;
  hint: ResourceHint | undefined;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const definition = getTabDefinition(record.kind);
  const { title, unavailable } = definition.useTitle(record, hint);
  const label = unavailable ? UNREADABLE_TITLE : (title ?? definition.typeLabel);
  const Icon = definition.icon;

  useEffect(() => {
    if (!active) return;
    ref.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [active]);

  /** 关闭当前标签；焦点原本在标签内时移到新的活动标签。 */
  const closeAndFocus = () => {
    const hadFocus = ref.current?.contains(document.activeElement) ?? false;
    onClose();
    if (!hadFocus) return;
    const nextId = useSidePanelStore.getState().surfaces[surface]?.activeId;
    if (!nextId) return;
    requestAnimationFrame(() => document.getElementById(tabDomId(surface, nextId))?.focus());
  };

  return (
    <div
      ref={ref}
      role="tab"
      id={tabDomId(surface, record.id)}
      aria-selected={active}
      aria-controls={tabPanelId(surface, record.id)}
      tabIndex={active ? 0 : -1}
      data-active={active ? "" : undefined}
      onClick={onActivate}
      onAuxClick={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        closeAndFocus();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onActivate();
      }}
      className={cn(
        "group/tab flex h-8 max-w-48 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-fill-hover text-label"
          : "text-label-secondary hover:bg-fill-hover hover:text-label",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className={cn("min-w-0 truncate", unavailable && "text-label-tertiary")} title={label}>
        {label}
      </span>
      <button
        type="button"
        aria-label={`关闭「${label}」`}
        title={`关闭「${label}」`}
        onClick={(event) => {
          event.stopPropagation();
          closeAndFocus();
        }}
        className="ml-0.5 shrink-0 rounded-sm p-0.5 text-label-tertiary opacity-0 transition-opacity outline-none hover:bg-fill hover:text-label focus-visible:opacity-100 group-hover/tab:opacity-100 group-data-[active]/tab:opacity-100 [@media(pointer:coarse)]:opacity-100"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </div>
  );
}
