"use client";

import { useUIStore } from "@/stores/ui-store";
import { Search } from "lucide-react";

/**
 * 页头动作行里的搜索入口（34 高的圆形图标按钮）。
 *
 * 知识库内各 Tab 页（D-01 / D-05 / D-07 / D-08 / D-09）与概览页（D-02）都
 * **不渲染顶栏**（见 `isKnowledgeBaseTabRoute`），所以画板里本该在顶栏的
 * 「搜索」必须由页面自己在页头动作行里给出——否则命令面板就只剩 ⌘K 一条入口，
 * 鼠标用户找不到。
 *
 * 与 `app-header.tsx` 里的 `SearchButton` 同职责、不同形态：那个是带「搜索」
 * 文字的次按钮（顶栏有横向空间），这里是 34 高图标按钮（与 `ThemeSwitcher`
 * 的 `size="icon"` 同尺寸，并排时不打架）。不合并成一个组件是因为两者连断点
 * 行为都不一样（顶栏版 `hidden sm:inline-flex`），合并只会得到一堆条件分支。
 */
export function PageSearchAction() {
  const setOpen = useUIStore((state) => state.setCommandPaletteOpen);
  return (
    <button
      type="button"
      data-testid="page-search-action"
      aria-label="打开命令面板"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={() => setOpen(true)}
      className="grid size-[34px] shrink-0 place-items-center rounded-full text-label-secondary outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Search className="size-[18px]" aria-hidden="true" />
    </button>
  );
}
