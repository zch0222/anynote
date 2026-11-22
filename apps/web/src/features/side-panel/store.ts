"use client";

import type { ResourceTarget } from "@/lib/ai/resource-target";
import { resourceKey } from "@/lib/ai/resource-target";
import { create } from "zustand";
import { resourceKind } from "./registry";
import { type SurfaceKey, type SurfaceState, type TabId, type TabRecord, asTabId } from "./types";

/**
 * 按宿主分区的侧栏标签状态与动作。
 *
 * @author 称霸幼儿园
 */

export const MAX_TABS = 10;

type StoreState = {
  surfaces: Record<SurfaceKey, SurfaceState>;
  guards: Record<SurfaceKey, (() => boolean) | null>;
  newWindowHandlers: Record<SurfaceKey, ((href: string) => void) | null>;
  openResource: (surface: SurfaceKey, target: ResourceTarget) => void;
  openPage: (surface: SurfaceKey, kind: string, contentId?: string, multiple?: boolean) => void;
  activate: (surface: SurfaceKey, tabId: TabId) => void;
  close: (surface: SurfaceKey, tabId: TabId) => void;
  setOpen: (surface: SurfaceKey, open: boolean) => void;
  toggleMaximized: (surface: SurfaceKey) => void;
  renameSurface: (from: SurfaceKey, to: SurfaceKey) => void;
  removeSurface: (surface: SurfaceKey) => void;
  registerGuard: (surface: SurfaceKey, guard: (() => boolean) | null) => () => void;
  registerNewWindow: (surface: SurfaceKey, handler: ((href: string) => void) | null) => () => void;
  hydrate: (surfaces: Record<SurfaceKey, SurfaceState>, options?: { ignoreOpen?: boolean }) => void;
};

/**
 * 新建一个空分区。
 *
 * @returns 空分区状态
 */
export function emptySurface(): SurfaceState {
  return {
    open: false,
    maximized: false,
    tabs: [],
    activeId: null,
    recent: [],
    seq: 0,
    navigation: {},
    hints: {},
    touchedAt: Date.now(),
  };
}

/**
 * 归一化恢复的分区：补齐序号，剔除失效的活动标签与最近使用记录。
 *
 * @param surface 持久化分区
 * @returns 可直接使用的分区
 */
export function normalizeSurface(surface: SurfaceState): SurfaceState {
  const maxSeq = surface.tabs.reduce((max, tab) => Math.max(max, tabIdNumber(tab.id)), 0);
  const ids = new Set(surface.tabs.map((tab) => tab.id));
  const activeId =
    surface.activeId && ids.has(surface.activeId)
      ? surface.activeId
      : (surface.tabs.at(-1)?.id ?? null);
  return {
    ...surface,
    seq: Math.max(surface.seq, maxSeq),
    activeId,
    recent: surface.recent.filter((id) => ids.has(id)),
  };
}

export const useSidePanelStore = create<StoreState>()((set, get) => ({
  surfaces: {},
  guards: {},
  newWindowHandlers: {},

  openResource: (surface, target) =>
    set((state) => {
      const current = state.surfaces[surface] ?? emptySurface();
      const key = resourceKey(target.ref);
      const existing = current.tabs.find(
        (tab) => tab.family === "resource" && resourceKey(tab.ref) === key,
      );
      if (existing) {
        if (existing.id !== current.activeId && !canLeave(state, surface)) return state;
        return {
          surfaces: {
            ...state.surfaces,
            [surface]: {
              ...current,
              open: true,
              activeId: existing.id,
              recent: moveToFront(current.recent, existing.id),
              navigation: {
                ...current.navigation,
                [existing.id]: {
                  locator: target.locator,
                  revision: (current.navigation[existing.id]?.revision ?? 0) + 1,
                },
              },
              hints: target.hint ? { ...current.hints, [existing.id]: target.hint } : current.hints,
              touchedAt: Date.now(),
            },
          },
        };
      }
      if (!canLeave(state, surface)) return state;

      const { id, seq } = nextTabId(current);
      const record: TabRecord = {
        id,
        kind: resourceKind(target.ref.type),
        family: "resource",
        ref: target.ref,
      };
      const tabs = insertAfterActive(current.tabs, current.activeId, record);
      const recent = [id, ...current.recent.filter((item) => item !== id)];
      const overflow = evictOverflow(
        tabs,
        recent,
        id,
        current.navigation,
        target.hint ? { ...current.hints, [id]: target.hint } : current.hints,
      );
      return {
        surfaces: {
          ...state.surfaces,
          [surface]: {
            ...current,
            ...overflow,
            open: true,
            activeId: id,
            seq,
            navigation: {
              ...overflow.navigation,
              [id]: { locator: target.locator, revision: 1 },
            },
            touchedAt: Date.now(),
          },
        },
      };
    }),

  openPage: (surface, kind, contentId = "", multiple = false) =>
    set((state) => {
      const current = state.surfaces[surface] ?? emptySurface();
      const existing = multiple
        ? undefined
        : current.tabs.find(
            (tab) => tab.family === "page" && tab.kind === kind && tab.contentId === contentId,
          );
      if (existing) {
        if (existing.id !== current.activeId && !canLeave(state, surface)) return state;
        return {
          surfaces: {
            ...state.surfaces,
            [surface]: {
              ...current,
              open: true,
              activeId: existing.id,
              recent: moveToFront(current.recent, existing.id),
              navigation: {
                ...current.navigation,
                [existing.id]: {
                  locator: {},
                  revision: (current.navigation[existing.id]?.revision ?? 0) + 1,
                },
              },
              touchedAt: Date.now(),
            },
          },
        };
      }
      if (!canLeave(state, surface)) return state;

      const { id, seq } = nextTabId(current);
      const record: TabRecord = { id, kind, family: "page", contentId };
      const tabs = insertAfterActive(current.tabs, current.activeId, record);
      const recent = [id, ...current.recent.filter((item) => item !== id)];
      const overflow = evictOverflow(tabs, recent, id, current.navigation, current.hints);
      return {
        surfaces: {
          ...state.surfaces,
          [surface]: {
            ...current,
            ...overflow,
            open: true,
            activeId: id,
            seq,
            navigation: {
              ...overflow.navigation,
              [id]: { locator: {}, revision: 1 },
            },
            touchedAt: Date.now(),
          },
        },
      };
    }),

  activate: (surface, tabId) =>
    set((state) => {
      const current = state.surfaces[surface];
      if (!current || current.activeId === tabId) return state;
      if (!current.tabs.some((tab) => tab.id === tabId)) return state;
      if (!canLeave(state, surface)) return state;
      return {
        surfaces: {
          ...state.surfaces,
          [surface]: {
            ...current,
            open: true,
            activeId: tabId,
            recent: moveToFront(current.recent, tabId),
            touchedAt: Date.now(),
          },
        },
      };
    }),

  close: (surface, tabId) =>
    set((state) => {
      const current = state.surfaces[surface];
      if (!current || !current.tabs.some((tab) => tab.id === tabId)) return state;
      if (tabId === current.activeId && !canLeave(state, surface)) return state;

      const tabs = current.tabs.filter((tab) => tab.id !== tabId);
      const navigation = { ...current.navigation };
      const hints = { ...current.hints };
      delete navigation[tabId];
      delete hints[tabId];
      const recent = current.recent.filter((id) => id !== tabId);
      const activeId =
        tabId === current.activeId
          ? (recent.find((id) => tabs.some((tab) => tab.id === id)) ?? tabs.at(-1)?.id ?? null)
          : current.activeId;
      return {
        surfaces: {
          ...state.surfaces,
          [surface]: {
            ...current,
            tabs,
            navigation,
            hints,
            recent,
            activeId,
            open: tabs.length > 0 ? current.open : false,
            touchedAt: Date.now(),
          },
        },
      };
    }),

  setOpen: (surface, open) =>
    set((state) => {
      const current = state.surfaces[surface] ?? emptySurface();
      if (current.open === open) return state;
      if (!open && !canLeave(state, surface)) return state;
      return {
        surfaces: {
          ...state.surfaces,
          [surface]: { ...current, open, touchedAt: Date.now() },
        },
      };
    }),

  toggleMaximized: (surface) =>
    set((state) => {
      const current = state.surfaces[surface] ?? emptySurface();
      return {
        surfaces: {
          ...state.surfaces,
          [surface]: {
            ...current,
            maximized: !current.maximized,
            open: true,
            touchedAt: Date.now(),
          },
        },
      };
    }),

  renameSurface: (from, to) =>
    set((state) => {
      if (from === to) return state;
      const current = state.surfaces[from];
      if (!current) return state;
      const surfaces = { ...state.surfaces };
      delete surfaces[from];
      surfaces[to] = current;
      const guards = { ...state.guards };
      guards[to] = guards[from] ?? null;
      delete guards[from];
      const newWindowHandlers = { ...state.newWindowHandlers };
      newWindowHandlers[to] = newWindowHandlers[from] ?? null;
      delete newWindowHandlers[from];
      return { surfaces, guards, newWindowHandlers };
    }),

  removeSurface: (surface) =>
    set((state) => {
      if (!state.surfaces[surface]) return state;
      const surfaces = { ...state.surfaces };
      delete surfaces[surface];
      const guards = { ...state.guards };
      delete guards[surface];
      const newWindowHandlers = { ...state.newWindowHandlers };
      delete newWindowHandlers[surface];
      return { surfaces, guards, newWindowHandlers };
    }),

  registerGuard: (surface, guard) => {
    set((state) => ({ guards: { ...state.guards, [surface]: guard } }));
    return () => {
      if (get().guards[surface] !== guard) return;
      set((state) => {
        const guards = { ...state.guards };
        delete guards[surface];
        return { guards };
      });
    };
  },

  registerNewWindow: (surface, handler) => {
    set((state) => ({ newWindowHandlers: { ...state.newWindowHandlers, [surface]: handler } }));
    return () => {
      if (get().newWindowHandlers[surface] !== handler) return;
      set((state) => {
        const newWindowHandlers = { ...state.newWindowHandlers };
        delete newWindowHandlers[surface];
        return { newWindowHandlers };
      });
    };
  },

  hydrate: (surfaces, options) =>
    set((state) => {
      const next = { ...state.surfaces };
      for (const [key, surface] of Object.entries(surfaces)) {
        if (next[key]) continue;
        const normalized = normalizeSurface(surface);
        next[key] = options?.ignoreOpen ? { ...normalized, open: false } : normalized;
      }
      return { surfaces: next };
    }),
}));

function canLeave(state: StoreState, surface: SurfaceKey): boolean {
  const current = state.surfaces[surface];
  if (!current?.activeId) return true;
  const guard = state.guards[surface];
  return guard ? guard() : true;
}

function moveToFront(recent: TabId[], tabId: TabId): TabId[] {
  return [tabId, ...recent.filter((id) => id !== tabId)];
}

function insertAfterActive(
  tabs: TabRecord[],
  activeId: TabId | null,
  record: TabRecord,
): TabRecord[] {
  const index = activeId ? tabs.findIndex((tab) => tab.id === activeId) : -1;
  const next = [...tabs];
  next.splice(index >= 0 ? index + 1 : next.length, 0, record);
  return next;
}

function nextTabId(surface: SurfaceState): { id: TabId; seq: number } {
  const seq = surface.seq + 1;
  return { id: asTabId(`t${seq}`), seq };
}

function tabIdNumber(id: string): number {
  const match = /^t(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

function evictOverflow(
  tabs: TabRecord[],
  recent: TabId[],
  activeId: TabId,
  navigation: SurfaceState["navigation"],
  hints: SurfaceState["hints"],
): Pick<SurfaceState, "tabs" | "recent" | "navigation" | "hints"> {
  let nextTabs = tabs;
  let nextRecent = recent;
  const nextNavigation = { ...navigation };
  const nextHints = { ...hints };
  while (nextTabs.length > MAX_TABS) {
    const candidate = [...nextRecent]
      .reverse()
      .find((id) => id !== activeId && nextTabs.some((tab) => tab.id === id));
    if (!candidate) break;
    nextTabs = nextTabs.filter((tab) => tab.id !== candidate);
    nextRecent = nextRecent.filter((id) => id !== candidate);
    delete nextNavigation[candidate];
    delete nextHints[candidate];
  }
  return { tabs: nextTabs, recent: nextRecent, navigation: nextNavigation, hints: nextHints };
}
