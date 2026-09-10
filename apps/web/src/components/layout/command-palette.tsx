"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useSidebar } from "@/components/ui/sidebar";
import { useHotkey } from "@/hooks/use-hotkey";
import { useUIStore } from "@/stores/ui-store";
import { Monitor, Plus } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";
import { newNoteRoute, themeOptions, workspaceRoutes } from "./navigation";

export function CommandPalette() {
  const open = useUIStore((state) => state.commandPaletteOpen);
  const setOpen = useUIStore((state) => state.setCommandPaletteOpen);
  const { setOpenMobile } = useSidebar();
  const { setTheme } = useTheme();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  useHotkey(
    "k",
    useCallback(() => {
      setOpenMobile(false);
      setOpen(!useUIStore.getState().commandPaletteOpen);
    }, [setOpen, setOpenMobile]),
  );

  const run = (action: () => void) => {
    setOpen(false);
    setOpenMobile(false);
    action();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={false}
        initialFocus={inputRef}
      >
        <DialogTitle className="sr-only">命令面板</DialogTitle>
        <DialogDescription className="sr-only">
          搜索页面或操作，使用方向键选择，回车执行，Esc 关闭。
        </DialogDescription>
        <Command label="搜索页面或操作" vimBindings={false}>
          <CommandInput ref={inputRef} placeholder="搜索页面或操作…" aria-label="搜索页面或操作" />
          <CommandList>
            <CommandEmpty>没有找到匹配的操作</CommandEmpty>
            <CommandGroup heading="快捷操作">
              <CommandItem
                value="创建笔记 new note"
                onSelect={() => run(() => router.push(newNoteRoute.href))}
              >
                <Plus />
                创建笔记
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="跳转到">
              {workspaceRoutes.map(({ title, href, icon: Icon }) => (
                <CommandItem
                  key={href}
                  value={`${title} ${href}`}
                  onSelect={() => run(() => router.push(href))}
                >
                  <Icon />
                  {title}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="外观">
              {themeOptions.map(({ value, label }) => (
                <CommandItem
                  key={value}
                  value={`主题 ${label} ${value}`}
                  onSelect={() => run(() => setTheme(value))}
                >
                  <Monitor />
                  主题：{label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            ↑ ↓ 选择 · Enter 执行 · Esc 关闭
          </p>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
