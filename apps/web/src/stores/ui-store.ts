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
