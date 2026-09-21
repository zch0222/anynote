"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { coverAvatarClassName } from "@/features/notes/lib/cover-gradient";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import {
  MOBILE_SEARCH_GROUP_LABELS,
  type MobileSearchGroupKey,
  type MobileSearchItem,
  buildMobileBaseItems,
  buildMobileSearchItems,
  canCreateNoteFromQuery,
  createNoteFromQueryHref,
  filterMobileSearchItems,
  isMobileSearchEmpty,
  splitTitleMatch,
} from "@/lib/mobile/search";
import { cn } from "@/lib/utils";
import {
  Bot,
  ChevronRight,
  CircleUser,
  LayoutDashboard,
  Library,
  type LucideIcon,
  MessageSquare,
  PenLine,
  Search,
  Settings,
  Sparkles,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const GROUP_ORDER: readonly MobileSearchGroupKey[] = ["action", "base", "page"];

/**
 * 页面入口的语义图标块（2026-09-19 核对 V17）。
 *
 * 原先所有页面行共用同一个蓝色 Sparkles 块，六行排下来分不清谁是谁；
 * 画板 M-10 图例 8 给每个入口自己的图标与色块，这里按地址映射。
 */
const PAGE_ROW_ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  "/m/dashboard": { icon: LayoutDashboard, tone: "bg-[#0a84ff]" },
  "/m/notes": { icon: Library, tone: "bg-[#30d158]" },
  "/m/ai/chat": { icon: MessageSquare, tone: "bg-[#ff9f0a]" },
  "/m/ai/pdf": { icon: Bot, tone: "bg-[#bf5af2]" },
  // `/m/docs` 的条目随 /docs 体系退役（M13.5）删除：候选集已无这条路由，
  // 留着是一份永不命中的陈旧映射（旧书签也已被中间件挡回笔记列表）。
  "/m/me": { icon: CircleUser, tone: "bg-[#5e5ce6]" },
  // 搜索候选里设置的地址是分节页 /m/settings/profile，不是 /m/settings（它只是个别名）
  "/m/settings/profile": { icon: Settings, tone: "bg-[#8e8e93]" },
};

/**
 * `/m/search`：⌘K 命令面板的移动端替代（M-10）。
 *
 * 全屏页而不是对话框：手机上弹层被软键盘挤到只剩两三行，选不动。
 * 候选集与匹配都在 `lib/mobile/search.ts` 的纯函数里，组件只负责渲染。
 *
 * 三组（快捷操作 / 知识库 / 页面）各有标题：一张不分组的长表读不出
 * "哪些是页面、哪些是我的库"。知识库取自 `useKnowledgeBasesQuery` 的缓存，
 * 不新增请求——这一页在空查询时也要把清单铺出来。
 */
export function MobileSearchPage() {
  const [query, setQuery] = useState("");
  const bases = useKnowledgeBasesQuery();

  const groups = useMemo(() => {
    const items = [...buildMobileSearchItems(), ...buildMobileBaseItems(bases.data ?? [])];
    return filterMobileSearchItems(items, query);
  }, [bases.data, query]);

  const empty = isMobileSearchEmpty(groups);
  const trimmed = query.trim();
  const canCreate = canCreateNoteFromQuery(query);

  return (
    <MobileScreen title="搜索" back="/m/dashboard">
      <div className="space-y-4 p-4" data-testid="mobile-search">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-tertiary"
            aria-hidden="true"
          />
          <input
            // biome-ignore lint/a11y/noAutofocus: 搜索页是"进来就打字"的页面（M-10 图例 3 明确要求进入即聚焦），没有其他可聚焦内容会被抢走
            autoFocus
            /*
             * 原生 input 而不是 ui/Input：这一页要 44 高 + 圆角 10 + 16 号字，
             * 而 ui/Input 的默认档是给表单用的 36 高，覆写三处不如直接写。
             */
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索页面、知识库或操作"
            placeholder="搜索页面、知识库或操作…"
            data-testid="mobile-search-input"
            className="h-11 w-full rounded-md bg-separator/40 pl-9 pr-11 text-base text-label outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
          />
          {/* 图例 4：有输入时出现 · XCircle 18 · 28 命中区 */}
          {query ? (
            <button
              type="button"
              aria-label="清除"
              data-testid="mobile-search-clear"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-label-tertiary outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <XCircle className="size-[18px]" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {/*
          V17：空查询时也要解释搜索范围（画板 M-10 默认清单下的说明行），
          否则用户以为能搜笔记正文。
        */}
        {query.trim() === "" && !empty ? (
          <p className="text-footnote text-label-tertiary" data-testid="mobile-search-scope">
            搜索覆盖页面与知识库名称，笔记正文暂不支持。
          </p>
        ) : null}

        {empty ? (
          <div className="space-y-3 py-6 text-center" data-testid="mobile-search-empty">
            {/* V17：无结果态补搜索图标，与空查询的说明形成同一套语言 */}
            <Search
              className="mx-auto size-8 text-label-tertiary"
              aria-hidden="true"
              data-testid="mobile-search-empty-icon"
            />
            <p className="text-headline font-semibold text-label">没有找到「{trimmed}」</p>
            <p className="text-footnote text-label-secondary">
              搜索只覆盖页面与知识库名称，笔记正文暂不支持。
            </p>
            {canCreate ? (
              <Link
                href={createNoteFromQueryHref(trimmed)}
                data-testid="mobile-search-create-note"
                className="inline-flex min-h-11 items-center gap-1.5 text-footnote font-medium text-accent outline-none focus-visible:underline"
              >
                <Sparkles className="size-4" aria-hidden="true" />
                用「{trimmed}」新建笔记
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {GROUP_ORDER.map((key) => {
              const items = groups[key];
              if (items.length === 0) return null;
              return (
                <section key={key} className="space-y-2" data-testid={`search-group-${key}`}>
                  <h2 className="text-footnote font-semibold text-label-secondary">
                    {MOBILE_SEARCH_GROUP_LABELS[key]}
                  </h2>
                  <ul className="overflow-hidden rounded-lg bg-surface">
                    {items.map((item) => (
                      <li key={item.href} className="border-b border-separator last:border-b-0">
                        <SearchRow item={item} query={query} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </MobileScreen>
  );
}

/**
 * 结果行（图例 6 / 7 / 8）。
 *
 * 右侧**只有 ›**：旧实现把 `/m/notes/new` 这类路径直接显示出来，
 * 那是开发者视角的信息，对用户只是噪音（方案 §2 的「面向开发者」一条）。
 */
function SearchRow({ item, query }: { item: MobileSearchItem; query: string }) {
  /*
   * 知识库行的色块按 id 取渐变，与「新建笔记」的库列表、工作台的库卡片同一套
   * （`cover-gradient`），用户在三个地方看到的是同一个颜色。
   * 页面行按地址取语义图标块（V17）；「创建笔记」保留笔形。
   */
  const baseId = item.group === "base" ? Number(item.href.split("/").pop()) : Number.NaN;
  /*
   * 「创建笔记」用**笔形**图标而不是 Sparkles（M-10 图例 5 原文：「蓝色方形图标块 +
   * 笔形图标」）。Sparkles 在仓库里是"AI / 智能"的语义，用在"新建一篇空白笔记"
   * 上会让用户以为点进去会生成内容。
   */
  const isCreateNote = item.href.startsWith("/m/notes/new");
  const pageIcon = PAGE_ROW_ICONS[item.href];
  const parts = splitTitleMatch(item.title, query);
  return (
    <Link
      href={item.href}
      data-testid={`search-row-${item.group}-${item.href}`}
      className={cn(
        "flex min-h-13 items-center gap-3 px-4 py-2 outline-none transition-colors",
        "focus-visible:bg-fill-hover",
      )}
    >
      {Number.isSafeInteger(baseId) && baseId > 0 ? (
        <span
          /*
           * H-6：30px 的色块用 `rounded-lg`（本仓库 `--radius-lg` = 14px）**视觉上
           * 就是一个正圆**——画板要求的是「30px 圆角 8 的方形」。改用显式的
           * `rounded-[8px]`：不能换成别的 `rounded-*` 档位，因为本项目的
           * `--radius-lg` 与 Tailwind 默认值不同，靠档位名猜圆角一定踩这个坑。
           */
          className={coverAvatarClassName(baseId, "size-[30px] rounded-[8px]")}
          aria-hidden="true"
        />
      ) : pageIcon ? (
        <span
          className={`grid size-[30px] shrink-0 place-items-center rounded-[8px] ${pageIcon.tone} text-white`}
          aria-hidden="true"
        >
          <pageIcon.icon className="size-4" />
        </span>
      ) : (
        <span
          className="grid size-[30px] shrink-0 place-items-center rounded-[8px] bg-accent-soft text-accent"
          aria-hidden="true"
        >
          {isCreateNote ? <PenLine className="size-4" /> : <Sparkles className="size-4" />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base text-label">
          {/* V16：命中的片段高亮，让用户看见"搜到了哪几个字" */}
          {parts ? (
            <>
              {parts.before}
              <mark
                className="rounded-[3px] bg-accent-soft px-0.5 text-accent"
                data-testid="search-match"
              >
                {parts.match}
              </mark>
              {parts.after}
            </>
          ) : (
            item.title
          )}
        </span>
        {item.hint ? (
          <span className="block truncate text-xs text-label-tertiary">{item.hint}</span>
        ) : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
    </Link>
  );
}
