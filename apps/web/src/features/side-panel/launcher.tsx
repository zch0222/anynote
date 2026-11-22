"use client";

import { Button } from "@/components/ui/button";
import { PanelRightOpen } from "lucide-react";
import dynamic from "next/dynamic";
import { type ReactNode, createContext, useContext, useRef, useState } from "react";
import {
  SidePanelLinkContext,
  type SidePanelOpenInput,
  type SidePanelOpenOptions,
} from "./link-context";

/**
 * 首屏常驻的侧栏入口：展开按钮、懒加载宿主与宿主状态桥。
 *
 * @author 称霸幼儿园
 */

export type PendingOpen = { input: SidePanelOpenInput | null; focus: boolean; seq: number };

export type SidePanelShell = {
  open: (input: SidePanelOpenInput | null, options?: SidePanelOpenOptions) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  mounted: boolean;
  pending: PendingOpen | null;
};

const SidePanelShellContext = createContext<SidePanelShell | null>(null);

/** 读取侧栏宿主状态；没有宿主的页面拿到空值。 */
export function useSidePanelShell(): SidePanelShell | null {
  return useContext(SidePanelShellContext);
}

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState<PendingOpen | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const seq = useRef(0);

  const open = (input: SidePanelOpenInput | null, options?: SidePanelOpenOptions) => {
    seq.current += 1;
    setMounted(true);
    setPending({ input, focus: options?.focus ?? false, seq: seq.current });
    setPanelOpen(true);
  };

  const value: SidePanelShell = {
    open,
    panelOpen,
    setPanelOpen,
    mounted,
    pending,
  };

  return (
    <SidePanelShellContext.Provider value={value}>
      <SidePanelLinkContext.Provider value={open}>{children}</SidePanelLinkContext.Provider>
    </SidePanelShellContext.Provider>
  );
}

/** 对话页头的展开按钮；侧栏展开时由调用方决定不渲染。 */
export function SidePanelExpandButton() {
  const shell = useSidePanelShell();
  if (!shell) return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="展开右侧栏"
      title="展开右侧栏"
      onClick={() => shell.open(null)}
    >
      <PanelRightOpen className="size-4" aria-hidden="true" />
    </Button>
  );
}

export const SidePanelHost = dynamic(
  () => import("./desktop/host").then((mod) => mod.SidePanelHost),
  { ssr: false },
);
