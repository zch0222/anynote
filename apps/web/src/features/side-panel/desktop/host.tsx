"use client";

import {
  type ResourceHint,
  type ResourceLocator,
  type ResourceTarget,
  targetFromCitation,
  targetFromToolItem,
} from "@/lib/ai/resource-target";
import { cn } from "@/lib/utils";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PendingOpen } from "../launcher";
import { computeLayout } from "../layout";
import { readSidePanelWidth, writeSidePanelWidth } from "../panel-width";
import { useSidePanelPersistence } from "../persistence";
import { RESOURCE_TYPE_LABEL } from "../resource-labels";
import { setSidePanelOpenFlag } from "../storage-keys";
import { useSidePanelStore } from "../store";
import { TabPanel } from "../tab-panel";
import type { TabRecord } from "../types";
import { tabDomId, tabPanelId } from "./ids";
import { ResizeHandle } from "./resize-handle";
import { TabBar } from "./tab-bar";

/**
 * 桌面侧栏宿主：推入或覆盖呈现、标签条、正文、拖拽条与播报区。
 *
 * @author 称霸幼儿园
 */

export type SidePanelHostProps = {
  surface: string;
  pending: PendingOpen | null;
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
  onListVisibleChange: (visible: boolean) => void;
};

const EMPTY_TABS: TabRecord[] = [];
const EMPTY_NAVIGATION: Record<string, { locator: ResourceLocator; revision: number }> = {};
const EMPTY_HINTS: Record<string, ResourceHint> = {};
const EMPTY_NAVIGATION_ENTRY = { locator: {}, revision: 1 };

export function SidePanelHost({
  surface,
  pending,
  panelOpen,
  onPanelOpenChange,
  onListVisibleChange,
}: SidePanelHostProps) {
  const [preferredWidth, setPreferredWidth] = useState<number | null>(() => readSidePanelWidth());
  const tabs = useSidePanelStore((state) => state.surfaces[surface]?.tabs) ?? EMPTY_TABS;
  const activeId = useSidePanelStore((state) => state.surfaces[surface]?.activeId) ?? null;
  const navigation =
    useSidePanelStore((state) => state.surfaces[surface]?.navigation) ?? EMPTY_NAVIGATION;
  const hints = useSidePanelStore((state) => state.surfaces[surface]?.hints) ?? EMPTY_HINTS;
  const storeOpen = useSidePanelStore((state) => state.surfaces[surface]?.open) ?? false;
  const maximized = useSidePanelStore((state) => state.surfaces[surface]?.maximized) ?? false;
  const openResource = useSidePanelStore((state) => state.openResource);
  const setOpen = useSidePanelStore((state) => state.setOpen);
  const toggleMaximized = useSidePanelStore((state) => state.toggleMaximized);
  const closeTab = useSidePanelStore((state) => state.close);
  const registerGuard = useSidePanelStore((state) => state.registerGuard);
  const registerNewWindow = useSidePanelStore((state) => state.registerNewWindow);

  const [announcement, setAnnouncement] = useState("");
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const asideRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const lastPendingSeq = useRef(0);
  const initialized = useRef(false);

  useSidePanelPersistence({
    onHydrated: (hasOpen) => {
      setSidePanelOpenFlag(hasOpen);
      onPanelOpenChange(hasOpen);
    },
  });

  useLayoutEffect(() => {
    if (!panelOpen) return;
    const element = asideRef.current?.parentElement;
    if (!element) return;
    const update = () => setContainerWidth(element.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [panelOpen]);

  const layout = computeLayout({
    width: containerWidth,
    preferred: preferredWidth,
    maximized,
  });

  useEffect(() => {
    onListVisibleChange(!panelOpen || layout.showList);
  }, [panelOpen, layout.showList, onListVisibleChange]);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    onPanelOpenChange(storeOpen);
    setSidePanelOpenFlag(storeOpen);
    if (!storeOpen) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[aria-label="展开右侧栏"]')?.focus();
      });
    }
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
      openResource(surface, target);
      const title = target.hint?.title ?? RESOURCE_TYPE_LABEL[target.ref.type];
      setAnnouncement(`已在右侧栏打开「${title}」`);
    } else if (!pending.input) {
      setOpen(surface, true);
    }
    if (pending.focus) {
      requestAnimationFrame(() => bodyRef.current?.focus());
    }
  }, [pending, surface, openResource, setOpen]);

  const activeRecord = tabs.find((tab) => tab.id === activeId) ?? null;
  const activeNavigation = activeRecord
    ? (navigation[activeRecord.id] ?? EMPTY_NAVIGATION_ENTRY)
    : EMPTY_NAVIGATION_ENTRY;

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

  if (!panelOpen) return null;

  const width = dragWidth ?? layout.panelWidth;
  const collapse = () => {
    setOpen(surface, false);
    if (!useSidePanelStore.getState().surfaces[surface]?.open) onPanelOpenChange(false);
  };

  /** 覆盖呈现时，焦点在标签条或标签头上按 Esc 收起。 */
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (layout.mode !== "overlay" || event.key !== "Escape") return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.closest("[data-side-panel-bar]") && !target.closest("[data-side-panel-header]")) {
      return;
    }
    event.preventDefault();
    collapse();
  };

  return (
    <aside
      ref={asideRef}
      aria-label="右侧栏"
      data-testid="side-panel"
      onKeyDown={handleKeyDown}
      className={cn(
        "flex min-h-0 flex-col bg-surface",
        layout.mode === "overlay"
          ? "absolute inset-0 z-30 border-l border-separator"
          : "relative shrink-0 border-l border-separator",
        layout.mode === "push" &&
          !resizing &&
          "transition-[width] duration-200 ease-linear motion-reduce:transition-none",
      )}
      style={layout.mode === "push" ? { width } : undefined}
    >
      <TabBar
        surface={surface}
        tabs={tabs}
        activeId={activeId}
        hints={hints}
        canMaximize={layout.canMaximize}
        maximized={maximized}
        onToggleMaximized={() => toggleMaximized(surface)}
        onCollapse={collapse}
      />
      {activeRecord ? (
        <TabPanel
          key={activeRecord.id}
          record={activeRecord}
          navigation={activeNavigation}
          variant="desktop"
          actions={actions}
          panelId={tabPanelId(surface, activeRecord.id)}
          labelledBy={tabDomId(surface, activeRecord.id)}
          bodyRef={bodyRef}
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-label-secondary">
          点击回答里的引用，在这里查看和编辑
        </div>
      )}
      <span className="sr-only" aria-live="polite" data-testid="side-panel-announcer">
        {announcement}
      </span>
      {layout.mode === "push" ? (
        <ResizeHandle
          width={width}
          minWidth={layout.minWidth}
          maxWidth={layout.maxWidth}
          onResize={setDragWidth}
          onCommit={(next) => {
            writeSidePanelWidth(next);
            setPreferredWidth(next);
            setDragWidth(null);
          }}
          onReset={() => {
            writeSidePanelWidth(null);
            setPreferredWidth(null);
            setDragWidth(null);
          }}
          onResizingChange={setResizing}
        />
      ) : null}
    </aside>
  );
}
