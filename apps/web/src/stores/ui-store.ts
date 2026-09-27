"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type UIState = {
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      commandPaletteOpen: false,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
    }),
    {
      name: "anynote-ui",
      /*
       * v0 的侧栏偏好不可信：桌面侧栏那时不响应它，编辑器里每次 Cmd / Ctrl + B 加粗
       * 却都会把它翻转一次。侧栏能收起之后照单全收，一部分用户打开页面就是收起的。
       */
      version: 1,
      migrate: () => ({ sidebarOpen: true }),
      partialize: ({ sidebarOpen }) => ({ sidebarOpen }),
      // SSR 与第一次客户端渲染一致；AppShell 挂载后恢复偏好。
      skipHydration: true,
      merge: (persisted, current) => {
        const value = (persisted as Partial<UIState> | null)?.sidebarOpen;
        return { ...current, sidebarOpen: typeof value === "boolean" ? value : true };
      },
    },
  ),
);
