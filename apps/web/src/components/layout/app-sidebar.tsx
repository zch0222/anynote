"use client";

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { SidebarKnowledgeBases, SidebarToolGroups, SidebarUserCard } from "./sidebar-nav";

/**
 * 产品标记。
 *
 * 设计稿里是一个蓝色圆角方块 + 「Anynote」字标。方块用 accent 底色 +
 * 首字母，不引入新图片资源，也跟随主题换色。
 */
function Brand() {
  return (
    <Link
      href="/dashboard"
      aria-label="Anynote 工作台"
      className="flex min-h-10 items-center gap-2 rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-sm bg-accent text-sm font-bold text-white"
      >
        A
      </span>
      <span className="text-headline font-semibold tracking-tight text-label">Anynote</span>
    </Link>
  );
}

/**
 * 桌面侧栏。
 *
 * 用原生 `aside` 而不是 `ui/sidebar` 的 `Sidebar`：这一版的设计是**固定宽度**的
 * 静态栏（256px，无图标折叠态），而 `ui/sidebar` 的 `collapsible="icon"` 会为
 * 折叠态引入一整套 tooltip / 宽度动画，与本设计不符，留着只会互相打架。
 *
 * 宽窄两态**只渲染一个**：`ui/sidebar` 的桌面分支和抽屉分支在 DOM 里是并列的，
 * 两个都挂就会把同一份导航渲染两遍（读屏会念两遍、`data-testid` 也会撞），
 * 所以这里用 `useIsMobile` 二选一。断点与 `ui/sidebar` 内部的判定同源（同为
 * `hooks/use-mobile` 的 768px），不会出现"两边都以为对方在渲染"的空档。
 */
export function AppSidebar() {
  const isMobile = useIsMobile();

  const content = (
    <>
      <SidebarHeader className="px-2 py-3">
        <Brand />
      </SidebarHeader>
      <div className="px-2 pb-1">
        <SearchHint />
      </div>
      <SidebarContent className="gap-0">
        <nav aria-label="主导航">
          <SidebarKnowledgeBases />
          <SidebarToolGroups />
        </nav>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <SidebarUserCard />
      </SidebarFooter>
    </>
  );

  if (isMobile) {
    // 抽屉：复用 ui/sidebar 的 Sheet 实现，内容与桌面侧栏同一份
    return <Sidebar collapsible="offcanvas">{content}</Sidebar>;
  }

  return (
    <aside data-testid="app-sidebar" className="hidden w-64 shrink-0 flex-col bg-sidebar md:flex">
      {content}
    </aside>
  );
}

/** 侧栏顶部的搜索入口：看起来是输入框，点开的是命令面板（设计稿同形）。 */
function SearchHint() {
  return (
    <button
      type="button"
      aria-label="搜索知识库、笔记、慕课"
      aria-keyshortcuts="Meta+K Control+K"
      data-testid="sidebar-search"
      onClick={() => {
        // 命令面板的开关走全局快捷键层（useHotkey 监听 window 的 keydown）：
        // 派发一个与 ⌘K 等价的事件，就不必让侧栏再订阅一份 UI store。
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
        );
      }}
      className={cn(
        "flex min-h-8 w-full items-center gap-2 rounded-md bg-separator/40 px-2.5 py-1.5 text-left text-footnote text-label-tertiary",
        "outline-none transition-colors hover:bg-separator/60 focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <SearchIcon />
      搜索知识库、笔记、慕课
    </button>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
    </svg>
  );
}
