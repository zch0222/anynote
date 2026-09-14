"use client";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { useUIStore } from "@/stores/ui-store";
import { ChevronDown, PanelLeft, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getWorkspaceRoute } from "./navigation";
import { ThemeSwitcher } from "./theme-switcher";

/** 从 `/notes/12/tasks` 这样的路径里取出知识库 id；不在知识库下则为 null。 */
export function parseBaseIdFromPath(pathname: string): number | null {
  const match = /^\/notes\/(\d+)(?:\/|$)/.exec(pathname);
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * 顶栏。
 *
 * 两套形态，由路径决定而不是由断点决定——桌面版在 `md` 以下也走「移动形态」，
 * 但真正的小屏由 `(mobile)` 路由段接管，所以这里只需处理宽窄：
 * - 工作区页：面包屑（应用名 / 当前入口）
 * - 知识库内：只留知识库切换器（二级导航在侧栏，见 `KnowledgeBaseSidebar`）
 *
 * 知识库内的顶栏**刻意很空**：设计稿里这一条属于编辑器，写的是"我在看哪篇笔记"。
 * 曾经把六个二级 Tab 摆在这里，结果顶栏成了全站最挤的一行，而侧栏同一批入口
 * 又空着——两处都放等于两处都不像主导航。
 */
export function AppHeader() {
  const pathname = usePathname();
  const baseId = parseBaseIdFromPath(pathname);
  const { toggleSidebar } = useSidebar();
  const route = getWorkspaceRoute(pathname);

  return (
    <header
      data-testid="app-header"
      className="sticky top-0 z-20 flex min-h-14 shrink-0 flex-wrap items-center gap-3 bg-grouped px-4 py-2 sm:px-6"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="切换侧边栏"
        onClick={toggleSidebar}
        className="md:hidden"
      >
        <PanelLeft aria-hidden="true" />
      </Button>

      {baseId ? <KnowledgeBaseSwitcher baseId={baseId} /> : <Breadcrumb title={route?.title} />}

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <SearchButton />
        <ThemeSwitcher />
      </div>
    </header>
  );
}

function Breadcrumb({ title }: { title?: string | undefined }) {
  return (
    <nav aria-label="面包屑" className="min-w-0">
      <ol className="flex items-center gap-2 text-footnote">
        <li className="text-label-tertiary">Anynote</li>
        <li aria-hidden="true" className="text-label-tertiary">
          /
        </li>
        <li aria-current="page" className="truncate font-medium text-label">
          {title ?? "工作空间"}
        </li>
      </ol>
    </nav>
  );
}

/**
 * 知识库页头：知识库名 + 类型/笔记数，点击回画廊去换一个库。
 *
 * 只做**展示 + 回画廊**：真正的"换一个知识库"在侧栏卡片与画廊页里，
 * 顶栏再放一份完整列表会与它们抢同一份交互，还要处理长列表滚动。
 */
function KnowledgeBaseSwitcher({ baseId }: { baseId: number }) {
  const base = useKnowledgeBaseQuery(baseId);
  const name = base.data?.knowledgeBaseName?.trim() || "知识库";
  const typeLabel = base.data?.type === 1 ? "组织知识库" : "普通知识库";

  return (
    <Link
      href="/notes"
      data-testid="kb-switcher"
      className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 outline-none transition-colors hover:bg-separator/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="truncate text-headline font-semibold text-label">{name}</span>
      {base.data ? (
        <span className="hidden shrink-0 text-footnote text-label-tertiary lg:inline">
          {typeLabel}
        </span>
      ) : null}
      <ChevronDown className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
    </Link>
  );
}

function SearchButton() {
  const setOpen = useUIStore((state) => state.setCommandPaletteOpen);
  return (
    <Button
      variant="outline"
      size="sm"
      aria-label="打开命令面板"
      aria-keyshortcuts="Meta+K Control+K"
      className="hidden sm:inline-flex"
      onClick={() => setOpen(true)}
    >
      <Search aria-hidden="true" />
      <span className="hidden md:inline">搜索</span>
    </Button>
  );
}
