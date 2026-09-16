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
} from "@/lib/mobile/search";
import { cn } from "@/lib/utils";
import { ChevronRight, PenLine, Search, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const GROUP_ORDER: readonly MobileSearchGroupKey[] = ["action", "base", "page"];

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

        {empty ? (
          <div className="space-y-3 py-6 text-center" data-testid="mobile-search-empty">
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
                        <SearchRow item={item} />
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
function SearchRow({ item }: { item: MobileSearchItem }) {
  /*
   * 知识库行的色块按 id 取渐变，与「新建笔记」的库列表、工作台的库卡片同一套
   * （`cover-gradient`），用户在三个地方看到的是同一个颜色。
   * 其余分组给一个中性的图标底。
   */
  const baseId = item.group === "base" ? Number(item.href.split("/").pop()) : Number.NaN;
  /*
   * 「创建笔记」用**笔形**图标而不是 Sparkles（M-10 图例 5 原文：「蓝色方形图标块 +
   * 笔形图标」）。Sparkles 在仓库里是"AI / 智能"的语义，用在"新建一篇空白笔记"
   * 上会让用户以为点进去会生成内容。
   */
  const isCreateNote = item.href.startsWith("/m/notes/new");
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
      ) : (
        <span
          className="grid size-[30px] shrink-0 place-items-center rounded-[8px] bg-accent-soft text-accent"
          aria-hidden="true"
        >
          {isCreateNote ? <PenLine className="size-4" /> : <Sparkles className="size-4" />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base text-label">{item.title}</span>
        {item.hint ? (
          <span className="block truncate text-xs text-label-tertiary">{item.hint}</span>
        ) : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
    </Link>
  );
}
