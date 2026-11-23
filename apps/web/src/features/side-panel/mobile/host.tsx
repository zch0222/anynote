"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type ResourceHint,
  type ResourceLocator,
  type ResourceTarget,
  resourceHref,
  targetFromCitation,
  targetFromToolItem,
} from "@/lib/ai/resource-target";
import { cn } from "@/lib/utils";
import { ExternalLink, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { tabDomId, tabPanelId } from "../desktop/ids";
import type { PendingOpen } from "../launcher";
import { useSidePanelPersistence } from "../persistence";
import { getTabDefinition, resourceKind } from "../registry";
import { RESOURCE_TYPE_LABEL } from "../resource-labels";
import { setSidePanelTabCount } from "../storage-keys";
import { useSidePanelStore } from "../store";
import { registerSurfaceHandlers } from "../surface-events";
import { TabPanel } from "../tab-panel";
import { UNREADABLE_TITLE } from "../tabs/shared";
import type { TabRecord } from "../types";

/**
 * 移动端全屏覆盖层：顶部关闭/标题/新窗口/更多，多标签时一排胶囊。
 *
 * @author 称霸幼儿园
 */

export type SidePanelMobileHostProps = {
  surface: string;
  pending: PendingOpen | null;
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
  onTabCountChange: (count: number) => void;
};

const EMPTY_TABS: TabRecord[] = [];
const EMPTY_NAVIGATION: Record<string, { locator: ResourceLocator; revision: number }> = {};
const EMPTY_HINTS: Record<string, ResourceHint> = {};
const EMPTY_NAVIGATION_ENTRY = { locator: {}, revision: 1 };
const OVERLAY_HISTORY_FLAG = "__anynoteSidePanel";

/** 当前历史记录是否已经带有覆盖层标记。 */
function hasOverlayHistoryEntry(): boolean {
  const state = window.history.state as { __anynoteSidePanel?: boolean } | null;
  return Boolean(state?.__anynoteSidePanel);
}

/** 压入一条同地址、带覆盖层标记的历史记录。 */
function pushOverlayHistoryEntry(): void {
  const state = window.history.state;
  window.history.pushState(
    { ...(typeof state === "object" && state !== null ? state : {}), [OVERLAY_HISTORY_FLAG]: true },
    "",
  );
}

export function SidePanelMobileHost({
  surface,
  pending,
  panelOpen,
  onPanelOpenChange,
  onTabCountChange,
}: SidePanelMobileHostProps) {
  const router = useRouter();
  const tabs = useSidePanelStore((state) => state.surfaces[surface]?.tabs) ?? EMPTY_TABS;
  const activeId = useSidePanelStore((state) => state.surfaces[surface]?.activeId) ?? null;
  const navigation =
    useSidePanelStore((state) => state.surfaces[surface]?.navigation) ?? EMPTY_NAVIGATION;
  const hints = useSidePanelStore((state) => state.surfaces[surface]?.hints) ?? EMPTY_HINTS;
  const storeOpen = useSidePanelStore((state) => state.surfaces[surface]?.open) ?? false;
  const openResource = useSidePanelStore((state) => state.openResource);
  const setOpen = useSidePanelStore((state) => state.setOpen);
  const activate = useSidePanelStore((state) => state.activate);
  const closeTab = useSidePanelStore((state) => state.close);
  const requestLeave = useSidePanelStore((state) => state.requestLeave);
  const registerGuard = useSidePanelStore((state) => state.registerGuard);
  const registerNewWindow = useSidePanelStore((state) => state.registerNewWindow);
  const removeSurface = useSidePanelStore((state) => state.removeSurface);
  const renameSurface = useSidePanelStore((state) => state.renameSurface);
  const newWindowHandler = useSidePanelStore((state) => state.newWindowHandlers[surface] ?? null);

  const [announcement, setAnnouncement] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const lastPendingSeq = useRef(0);
  const initialized = useRef(false);

  useSidePanelPersistence({ ignoreOpen: true });

  useEffect(
    () =>
      registerSurfaceHandlers({
        remove: (key) => removeSurface(key),
        rename: (from, to) => renameSurface(from, to),
      }),
    [removeSurface, renameSurface],
  );

  useEffect(() => {
    setSidePanelTabCount(tabs.length);
    onTabCountChange(tabs.length);
  }, [tabs.length, onTabCountChange]);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    onPanelOpenChange(storeOpen);
  }, [storeOpen, onPanelOpenChange]);

  useEffect(() => {
    if (!pending || pending.seq === lastPendingSeq.current) return;
    lastPendingSeq.current = pending.seq;
    const target = pending.input
      ? pending.input.kind === "citation"
        ? targetFromCitation(pending.input.citation)
        : targetFromToolItem(pending.input.entry)
      : null;
    if (target) {
      const definition = getTabDefinition(resourceKind(target.ref.type));
      if (!definition.mobile) {
        const href = resourceHref(target, "mobile");
        if (href) router.push(href);
        return;
      }
      openResource(surface, target);
      const title = target.hint?.title ?? RESOURCE_TYPE_LABEL[target.ref.type];
      setAnnouncement(`已在右侧栏打开「${title}」`);
    } else if (!pending.input) {
      setOpen(surface, true);
    }
    if (pending.focus) {
      requestAnimationFrame(() => bodyRef.current?.focus());
    }
  }, [pending, surface, openResource, setOpen, router]);

  /** 打开覆盖层时压一条同地址记录，返回手势与「关闭」都靠它退出。 */
  useEffect(() => {
    if (!panelOpen || hasOverlayHistoryEntry()) return;
    pushOverlayHistoryEntry();
  }, [panelOpen]);

  useEffect(() => {
    const handlePopState = () => {
      if (!useSidePanelStore.getState().surfaces[surface]?.open) return;
      setOpen(surface, false);
      if (useSidePanelStore.getState().surfaces[surface]?.open) {
        // 守卫拒绝关闭：补回刚被 pop 掉的历史标记，保持覆盖层与草稿
        pushOverlayHistoryEntry();
        return;
      }
      onPanelOpenChange(false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [surface, setOpen, onPanelOpenChange]);

  const activeRecord = tabs.find((tab) => tab.id === activeId) ?? null;
  const activeNavigation = activeRecord
    ? (navigation[activeRecord.id] ?? EMPTY_NAVIGATION_ENTRY)
    : EMPTY_NAVIGATION_ENTRY;
  const definition = activeRecord ? getTabDefinition(activeRecord.kind) : null;
  const href =
    activeRecord && definition?.href
      ? definition.href(activeRecord, activeNavigation.locator, "mobile")
      : null;
  const moreItems =
    activeRecord && definition?.moreMenu
      ? definition.moreMenu(activeRecord, activeNavigation.locator, "mobile")
      : [];

  const actions = useMemo(
    () => ({
      openResource: (target: ResourceTarget) => openResource(surface, target),
      close: () => {
        if (activeRecord) closeTab(surface, activeRecord.id);
      },
      registerGuard: (guard: () => boolean) => registerGuard(surface, guard),
      registerNewWindow: (handler: ((href: string) => void) | null) =>
        registerNewWindow(surface, handler),
    }),
    [surface, activeRecord, openResource, closeTab, registerGuard, registerNewWindow],
  );

  const closeOverlay = () => {
    setOpen(surface, false);
    if (useSidePanelStore.getState().surfaces[surface]?.open) return;
    if (hasOverlayHistoryEntry()) {
      window.history.back();
      return;
    }
    onPanelOpenChange(false);
  };

  const openNewWindow = (target: string | null) => {
    if (!target) return;
    if (newWindowHandler) {
      newWindowHandler(target);
      return;
    }
    window.open(target, "_blank", "noopener");
  };

  /** 当前窗口跳到完整页面：先走活动正文的离开守卫，取消时不导航。 */
  const openFullPage = (target: string) => {
    if (!requestLeave(surface)) return;
    router.push(target);
  };

  if (!panelOpen) return null;

  return (
    // biome-ignore lint/a11y/useSemanticElements: 覆盖层需要固定定位与自定义关闭语义，dialog 会接管显示
    <div
      role="dialog"
      aria-modal="true"
      aria-label="右侧栏"
      data-testid="side-panel-mobile"
      className="fixed inset-0 z-50 flex flex-col bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <header
        className="flex h-14 shrink-0 items-center gap-2 border-b border-separator px-3"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          closeOverlay();
        }}
      >
        <Button variant="ghost" size="sm" onClick={closeOverlay}>
          关闭
        </Button>
        <div className="min-w-0 flex-1">
          {activeRecord ? (
            <MobileTitle
              id={tabDomId(surface, activeRecord.id)}
              record={activeRecord}
              hint={hints[activeRecord.id]}
            />
          ) : (
            <h2 className="truncate text-sm font-medium text-label">右侧栏</h2>
          )}
        </div>
        {href ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="在新窗口打开"
            title="在新窗口打开"
            onClick={() => openNewWindow(href)}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        {activeRecord ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="更多" title="更多" />}
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {href ? (
                  <DropdownMenuItem onClick={() => openFullPage(href)}>
                    打开完整页面
                  </DropdownMenuItem>
                ) : null}
                {moreItems.map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    onClick={() => {
                      if (item.newWindow) {
                        openNewWindow(item.href);
                        return;
                      }
                      openFullPage(item.href);
                    }}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>

      {tabs.length > 1 ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-separator px-3 py-2">
          {tabs.map((record) => (
            <MobileTabPill
              key={record.id}
              record={record}
              hint={hints[record.id]}
              active={record.id === activeId}
              onActivate={() => activate(surface, record.id)}
            />
          ))}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        {activeRecord ? (
          <TabPanel
            key={activeRecord.id}
            record={activeRecord}
            navigation={activeNavigation}
            variant="mobile"
            actions={actions}
            panelId={tabPanelId(surface, activeRecord.id)}
            labelledBy={tabDomId(surface, activeRecord.id)}
            bodyRef={bodyRef}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-label-secondary">
            点击回答里的引用，在这里查看和编辑
          </div>
        )}
      </div>
      <span className="sr-only" aria-live="polite" data-testid="side-panel-announcer">
        {announcement}
      </span>
    </div>
  );
}

function MobileTitle({
  id,
  record,
  hint,
}: {
  id: string;
  record: TabRecord;
  hint: ResourceHint | undefined;
}) {
  const definition = getTabDefinition(record.kind);
  const { title, unavailable } = definition.useTitle(record, hint);
  const label = unavailable ? UNREADABLE_TITLE : (title ?? definition.typeLabel);
  return (
    <h2 id={id} className="truncate text-sm font-medium text-label" title={label}>
      {label}
    </h2>
  );
}

function MobileTabPill({
  record,
  hint,
  active,
  onActivate,
}: {
  record: TabRecord;
  hint: ResourceHint | undefined;
  active: boolean;
  onActivate: () => void;
}) {
  const definition = getTabDefinition(record.kind);
  const { title, unavailable } = definition.useTitle(record, hint);
  const label = unavailable ? UNREADABLE_TITLE : (title ?? definition.typeLabel);
  const Icon = definition.icon;
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex max-w-48 shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-accent-soft text-accent" : "bg-fill text-label-secondary",
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}
