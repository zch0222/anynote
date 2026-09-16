"use client";

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import { useMoocsQuery } from "@/features/mooc/use-moocs";
import { DEFAULT_PAGE_SIZE } from "@/features/notes/schemas";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import { useTasksQuery } from "@/features/tasks/use-tasks";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCardMeta } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { parseBaseIdFromPath } from "./app-header";
import { AnynoteLogo } from "./brand-logo";
import {
  SidebarKnowledgeBaseCard,
  SidebarKnowledgeBaseNav,
  SidebarNoteDirectory,
} from "./knowledge-base-sidebar";
import { parseKnowledgeBaseSection } from "./navigation";
import { SidebarKnowledgeBases, SidebarToolGroups, SidebarUserCard } from "./sidebar-nav";

/**
 * 产品标记。
 *
 * 设计稿里是一个蓝色圆角方块 + 「Anynote」字标。方块用 `AnynoteLogo`
 * 而不是「accent 底 + 首字母 A」：侧栏与启动页必须是**同一个标记**——
 * 启动页刚画完的书，落到工作区就变成了一个字母，品牌就断在这里了。
 */
function Brand() {
  return (
    <Link
      href="/dashboard"
      aria-label="Anynote 工作台"
      className="flex min-h-10 items-center gap-2 rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <AnynoteLogo size={28} />
      <span className="text-headline font-semibold tracking-tight text-label">Anynote</span>
    </Link>
  );
}

/**
 * 桌面侧栏。
 *
 * 用原生 `aside` 而不是 `ui/sidebar` 的 `Sidebar`：这一版的设计是**固定宽度**的
 * 静态栏（无图标折叠态），而 `ui/sidebar` 的 `collapsible="icon"` 会为折叠态
 * 引入一整套 tooltip / 宽度动画，与本设计不符，留着只会互相打架。
 *
 * 宽窄两态**只渲染一个**：`ui/sidebar` 的桌面分支和抽屉分支在 DOM 里是并列的，
 * 两个都挂就会把同一份导航渲染两遍（读屏会念两遍、`data-testid` 也会撞），
 * 所以这里用 `useIsMobile` 二选一。断点与 `ui/sidebar` 内部的判定同源（同为
 * `hooks/use-mobile` 的 768px），不会出现"两边都以为对方在渲染"的空档。
 */
export function AppSidebar() {
  const isMobile = useIsMobile();
  const pathname = usePathname();

  const content = (
    <>
      <SidebarHeader className="px-4 py-3">
        <Brand />
      </SidebarHeader>
      <SidebarContent className="gap-0 px-2.5 pb-2">
        <SidebarBody />
      </SidebarContent>
      <SidebarFooter className="p-2.5">
        <SidebarUserCard />
      </SidebarFooter>
    </>
  );

  if (isMobile) {
    // 抽屉：复用 ui/sidebar 的 Sheet 实现，内容与桌面侧栏同一份
    return <Sidebar collapsible="offcanvas">{content}</Sidebar>;
  }

  /*
   * 侧栏宽度**按路由分两档**，与画板实测一致（D-xx 知识库内一组 296，
   * D-03/D-10/D-12/D-13 一组 272）：
   * 库内要放下 264 宽的知识库卡片（名称 + 类型 + 篇数一行），窄了会截断；
   * 库外只有搜索框与列表，272 就够。
   *
   * 用完整类名字面量而不是 `w-[296px]` 之外的条件拼接：Tailwind 的 JIT
   * 只扫描源码里的字面类名，拼出来的字符串不会进产物。
   */
  const insideBase = parseBaseIdFromPath(pathname) !== null;

  return (
    <aside
      data-testid="app-sidebar"
      data-width={insideBase ? "wide" : "default"}
      className={cn(
        "hidden shrink-0 flex-col bg-sidebar md:flex",
        insideBase ? "w-[296px]" : "w-[272px]",
      )}
    >
      {content}
    </aside>
  );
}

/**
 * 侧栏主体两态。
 *
 * 进到知识库内（`/notes/<id>/*`）时侧栏**换一套内容**：头部是当前知识库卡片，
 * 下面是它的二级导航。这不是"多显示一点"，而是设计稿的核心主张——
 * 侧栏要说清"我在哪个库、这个库里有什么"，而不是继续罗列"我有哪些库"。
 * 反过来，进了库之后"换一个库"就不再是高频动作，它收进卡片右侧的切换箭头。
 *
 * 两态各自只订阅自己需要的查询：在画廊页不该为了侧栏去拉某个库的笔记。
 */
function SidebarBody() {
  const pathname = usePathname();
  const baseId = parseBaseIdFromPath(pathname);

  if (baseId) return <KnowledgeBaseSidebar baseId={baseId} pathname={pathname} />;
  return <GlobalSidebar />;
}

/** 知识库外：搜索 + 知识库列表 + 跨库能力。 */
function GlobalSidebar() {
  return (
    <>
      <div className="pb-1">
        <SearchHint />
      </div>
      <nav aria-label="主导航">
        <SidebarKnowledgeBases />
        <SidebarToolGroups />
      </nav>
    </>
  );
}

/**
 * 知识库内：当前库卡片 + 二级导航 + 笔记目录。
 *
 * 三个计数来自已有的列表查询（笔记/慕课/任务各一次，取 `total`）。
 * 它们与对应 Tab 页共用同一棵 query 缓存，切 Tab 不会重复请求。
 * 「资料」不给数字：设计稿那里本来也没有，且它的计数要额外拉一次文档列表，
 * 只为侧栏多一个数字并不划算。
 *
 * 笔记目录挂在侧栏底部（设计稿的位置）：它只在「笔记」这一面有意义，
 * 在概览/成员页摊开只会挤掉要看的内容。
 */
function KnowledgeBaseSidebar({ baseId, pathname }: { baseId: number; pathname: string }) {
  const base = useKnowledgeBaseQuery(baseId);
  const notes = useNotesQuery({ knowledgeBaseId: baseId, page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const moocs = useMoocsQuery(baseId);
  const tasks = useTasksQuery(baseId, 1);
  const section = parseKnowledgeBaseSection(sectionSegmentFromPath(pathname, baseId));

  return (
    <>
      <SidebarKnowledgeBaseCard
        base={base.data}
        isPending={base.isPending}
        noteCount={notes.data?.total}
      />
      <SidebarKnowledgeBaseNav
        baseId={baseId}
        activeSection={section}
        counts={{
          notes: notes.data?.total,
          mooc: moocs.data?.total,
          tasks: tasks.data?.total,
        }}
      />
      <SidebarNoteDirectory
        baseId={baseId}
        hidden={section !== "notes"}
        isLoading={notes.isPending}
        activeNoteId={parseNoteIdFromPath(pathname, baseId)}
        notes={(notes.data?.rows ?? []).map((item) => ({
          id: item.id,
          title: item.title?.trim() || "未命名笔记",
          meta: formatCardMeta({ updatedAt: item.latestOperationTime ?? item.updateTime }),
        }))}
      />
    </>
  );
}

/**
 * 取 `/notes/<baseId>/<noteId>` 里的 `<noteId>`；不在编辑器里则为 `undefined`。
 *
 * 只认**纯数字**的第二段：`/notes/<baseId>/docs` 这类静态段不是笔记 id，
 * 侧栏目录据此不高亮任何一行。
 */
export function parseNoteIdFromPath(pathname: string, baseId: number): number | undefined {
  const prefix = `/notes/${baseId}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const segment = pathname.slice(prefix.length).split("/")[0];
  if (!segment || !/^\d+$/.test(segment)) return undefined;
  const id = Number(segment);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

/**
 * 取 `/notes/<baseId>/<segment>` 里的 `<segment>`。
 *
 * 不能直接 `split("/")[3]`：编辑器路径是 `/notes/<baseId>/<noteId>`，
 * 那一段是数字——`parseKnowledgeBaseSection` 对非 section 段回落到 `notes`，
 * 正好是编辑器该归属的那个 Tab。
 */
export function sectionSegmentFromPath(pathname: string, baseId: number): string | undefined {
  const prefix = `/notes/${baseId}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  return pathname.slice(prefix.length).split("/")[0];
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
