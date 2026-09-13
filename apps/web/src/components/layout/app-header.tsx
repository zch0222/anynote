"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { ChevronDown, PanelLeft, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getWorkspaceRoute, knowledgeBaseSectionHref, knowledgeBaseSections } from "./navigation";
import { ThemeSwitcher } from "./theme-switcher";

/** 从 `/notes/12/tasks` 这样的路径里取出知识库 id；不在知识库下则为 null。 */
export function parseBaseIdFromPath(pathname: string): number | null {
  const match = /^\/notes\/(\d+)(?:\/|$)/.exec(pathname);
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * 知识库的二级 Tab 条。
 *
 * 设计稿把四类子资源与「概览 / 成员」收进知识库内部的 Tab，
 * 一级导航只保留知识库本身——这一条就是那个层级关系的落点。
 */
export function KnowledgeBaseTabs({ baseId }: { baseId: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="知识库内容" className="flex items-center gap-1 overflow-x-auto">
      {knowledgeBaseSections.map((section) => {
        const href = knowledgeBaseSectionHref(baseId, section.key);
        // 编辑器（/notes/:id/:noteId，noteId 是数字）仍然算在「笔记」下
        const active =
          section.key === "notes"
            ? pathname === `/notes/${baseId}` || /^\/notes\/\d+\/\d+/.test(pathname)
            : pathname === href;
        return (
          <Link
            key={section.key}
            href={href}
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : "false"}
            data-testid={`kb-tab-${section.key}`}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-footnote outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-separator/60 font-medium text-label"
                : "text-label-secondary hover:bg-separator/40 hover:text-label",
            )}
          >
            {section.title}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * 顶栏。
 *
 * 两套形态，由路径决定而不是由断点决定——桌面版在 `md` 以下也走「移动形态」，
 * 但真正的小屏由 `(mobile)` 路由段接管，所以这里只需处理宽窄：
 * - 工作区页：面包屑（应用名 / 当前入口）
 * - 知识库内：知识库切换器 + 二级 Tab（层级越深，顶栏越要说明"我在哪"）
 */
export function AppHeader() {
  const pathname = usePathname();
  const baseId = parseBaseIdFromPath(pathname);
  const { toggleSidebar } = useSidebar();
  const route = getWorkspaceRoute(pathname);

  return (
    <header className="sticky top-0 z-20 flex min-h-14 shrink-0 flex-wrap items-center gap-3 bg-grouped px-4 py-2 sm:px-6">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="切换侧边栏"
        onClick={toggleSidebar}
        className="md:hidden"
      >
        <PanelLeft aria-hidden="true" />
      </Button>

      {baseId ? <KnowledgeBaseHeader baseId={baseId} /> : <Breadcrumb title={route?.title} />}

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
 * 知识库页头：左侧是「知识库名 + 类型/笔记数」的下拉切换器，下方是二级 Tab。
 *
 * 切换器本身先只做**展示 + 回画廊**：真正的"换一个知识库"在侧栏里，
 * 顶栏再放一份完整列表会与侧栏抢同一份交互，且要处理长列表滚动。
 * 因此它指向 `/notes`（画廊），由画廊承担"选一个库"的职责。
 */
function KnowledgeBaseHeader({ baseId }: { baseId: number }) {
  const base = useKnowledgeBaseQuery(baseId);
  const name = base.data?.knowledgeBaseName?.trim() || "知识库";

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
      <Link
        href="/notes"
        data-testid="kb-switcher"
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 outline-none transition-colors hover:bg-separator/40 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate text-headline font-semibold text-label">{name}</span>
        <ChevronDown className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
      </Link>
      {base.data?.detail ? (
        <Badge variant="secondary" className="hidden max-w-64 truncate lg:inline-flex">
          {base.data.detail}
        </Badge>
      ) : null}
      <KnowledgeBaseTabs baseId={baseId} />
    </div>
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
