"use client";

import { useMe } from "@/features/auth/use-me";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { tabDefinitions } from "./registry";
import { sidePanelStorageKey } from "./storage-keys";
import { normalizeSurface, useSidePanelStore } from "./store";
import { type SurfaceKey, type SurfaceState, type TabRecord, asTabId } from "./types";

/**
 * 侧栏按用户持久化：只存资源标识，读取时整体校验，写入失败退回内存状态。
 *
 * @author 称霸幼儿园
 */

/** 每个用户最多保留的会话分区数。 */
export const MAX_SURFACES = 50;
/** 写入防抖。 */
export const PERSIST_DEBOUNCE_MS = 300;

const positiveInt = z.number().int().positive();

const refSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("kb"), id: positiveInt }),
  z.object({ type: z.literal("note"), id: positiveInt, kbId: positiveInt }),
  z.object({ type: z.literal("doc"), id: positiveInt, kbId: positiveInt.nullable() }),
  z.object({ type: z.literal("mooc"), id: positiveInt, kbId: positiveInt }),
  z.object({
    type: z.literal("mooc_item"),
    id: positiveInt,
    kbId: positiveInt,
    moocId: positiveInt,
  }),
  z.object({ type: z.literal("task"), id: positiveInt, kbId: positiveInt }),
]);

const resourceTabSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  ref: refSchema,
});

const surfaceSchema = z
  .object({
    open: z.boolean(),
    activeId: z.string().min(1).nullable(),
    tabs: z.array(resourceTabSchema).max(10),
    recent: z.array(z.string()),
    seq: z.number().int().nonnegative(),
    touchedAt: z.number(),
  })
  .refine(
    (surface) =>
      surface.activeId === null || surface.tabs.some((tab) => tab.id === surface.activeId),
    {
      message: "活动标签不在标签列表里",
    },
  )
  .refine((surface) => surface.recent.every((id) => surface.tabs.some((tab) => tab.id === id)), {
    message: "最近使用记录不在标签列表里",
  });

const storedSchema = z.object({
  version: z.literal(1),
  surfaces: z.record(z.string(), surfaceSchema),
});

/**
 * 读取某个用户的侧栏状态。
 *
 * @param userId 用户 id
 * @returns 已校验的分区，损坏或版本不符时删除该用户的键并返回空
 */
export function loadSidePanelState(userId: number): Record<SurfaceKey, SurfaceState> | null {
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  if (typeof localStorage === "undefined") return null;
  const key = sidePanelStorageKey(userId);
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    removeKey(key);
    return null;
  }
  const result = storedSchema.safeParse(parsed);
  if (!result.success) {
    removeKey(key);
    return null;
  }

  const entries = Object.entries(result.data.surfaces)
    .sort((left, right) => right[1].touchedAt - left[1].touchedAt)
    .slice(0, MAX_SURFACES);
  return Object.fromEntries(
    entries.map(([surfaceKey, surface]) => [surfaceKey, toSurfaceState(surface)]),
  );
}

/**
 * 写入某个用户的侧栏状态。
 *
 * @param userId 用户 id
 * @param surfaces 当前分区
 */
export function saveSidePanelState(
  userId: number,
  surfaces: Record<SurfaceKey, SurfaceState>,
): void {
  if (!Number.isSafeInteger(userId) || userId <= 0) return;
  if (typeof localStorage === "undefined") return;
  const key = sidePanelStorageKey(userId);
  const entries = Object.entries(surfaces)
    .filter(([surfaceKey]) => surfaceKey.startsWith("chat:"))
    .sort((left, right) => right[1].touchedAt - left[1].touchedAt)
    .slice(0, MAX_SURFACES);
  if (entries.length === 0) {
    removeKey(key);
    return;
  }
  const payload = {
    version: 1 as const,
    surfaces: Object.fromEntries(
      entries.map(([surfaceKey, surface]) => [surfaceKey, serializeSurface(surface)]),
    ),
  };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // 配额或隐私模式：内存状态照常使用
  }
}

/**
 * 只序列化可持久化的资源标签，标题、知识库名、定位、最大化都不写入。
 *
 * @param surface 分区状态
 * @returns 可写入的对象
 */
export function serializeSurface(surface: SurfaceState) {
  const tabs = surface.tabs
    .filter(isPersistableTab)
    .map((tab) => ({ id: tab.id, kind: tab.kind, ref: tab.ref }));
  const ids = new Set(tabs.map((tab) => tab.id));
  return {
    open: surface.open,
    activeId:
      surface.activeId && ids.has(surface.activeId) ? surface.activeId : (tabs.at(-1)?.id ?? null),
    tabs,
    recent: surface.recent.filter((id) => ids.has(id)),
    seq: surface.seq,
    touchedAt: surface.touchedAt,
  };
}

/**
 * 在侧栏宿主内读取用户 id、恢复一次状态并按 300ms 防抖写入。
 *
 * @param options.ignoreOpen 移动端加载时忽略展开状态
 * @param options.onHydrated 恢复完成后回调是否存在展开的分区
 */
export function useSidePanelPersistence(options: {
  ignoreOpen?: boolean;
  onHydrated?: (hasOpen: boolean) => void;
}): void {
  const me = useMe();
  const rawId = me.data?.id;
  const userId =
    typeof rawId === "number" && Number.isSafeInteger(rawId) && rawId > 0 ? rawId : null;
  const loadedFor = useRef<number | null>(null);
  const onHydratedRef = useRef(options.onHydrated);
  onHydratedRef.current = options.onHydrated;
  const ignoreOpen = options.ignoreOpen === true;

  useEffect(() => {
    if (loadedFor.current === userId) return;
    const previous = loadedFor.current;
    loadedFor.current = userId;
    if (userId === null) return;
    if (previous !== null && previous !== userId) {
      useSidePanelStore.setState({ surfaces: {}, guards: {}, newWindowHandlers: {} });
    }
    const stored = loadSidePanelState(userId);
    if (!stored) return;
    useSidePanelStore.getState().hydrate(stored, { ignoreOpen });
    onHydratedRef.current?.(Object.values(stored).some((surface) => surface.open));
  }, [userId, ignoreOpen]);

  useEffect(() => {
    if (userId === null) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSurfaces = useSidePanelStore.getState().surfaces;
    const flush = () => {
      timer = null;
      saveSidePanelState(userId, useSidePanelStore.getState().surfaces);
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, PERSIST_DEBOUNCE_MS);
    };
    const unsubscribe = useSidePanelStore.subscribe((state) => {
      if (state.surfaces === lastSurfaces) return;
      lastSurfaces = state.surfaces;
      schedule();
    });
    const handlePageHide = () => {
      if (!timer) return;
      clearTimeout(timer);
      flush();
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [userId]);
}

function isPersistableTab(tab: TabRecord): tab is Extract<TabRecord, { family: "resource" }> {
  if (tab.family !== "resource") return false;
  const definition = tabDefinitions.find((item) => item.kind === tab.kind);
  return definition?.persist ?? true;
}

function toSurfaceState(surface: z.infer<typeof surfaceSchema>): SurfaceState {
  return normalizeSurface({
    open: surface.open,
    maximized: false,
    tabs: surface.tabs.map((tab) => ({
      id: asTabId(tab.id),
      kind: tab.kind,
      family: "resource",
      ref: tab.ref,
    })),
    activeId: surface.activeId ? asTabId(surface.activeId) : null,
    recent: surface.recent.map(asTabId),
    seq: surface.seq,
    navigation: {},
    hints: {},
    touchedAt: surface.touchedAt,
  });
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 隐私模式下删除失败不影响从空状态开始
  }
}
