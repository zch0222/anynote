import type { KnowledgeBaseSection } from "@/components/layout/navigation";
import { knowledgeBaseSections } from "@/components/layout/navigation";

/**
 * 概览页「内容概况」的 5 格计数（D-02 图例 10–15）。
 *
 * 顺序与侧栏二级导航**一一对应**（图例原话："5 格，与侧栏二级导航一一对应"），
 * 所以这里不手写一份数组，而是从 `knowledgeBaseSections` 派生——
 * 两处各写一份的话，将来侧栏加一个 Tab，概览的格子会静默地少一个。
 *
 * 「笔记」面在侧栏对应的 key 是 `notes`，但它没有色块以外的额外语义；
 * 目录的 `overview` 自己不是内容面，不在 5 格之内。
 */
export const OVERVIEW_TILES = [
  { key: "notes", label: "笔记", href: (baseId: number) => `/notes/${baseId}` },
  { key: "mooc", label: "慕课", href: (baseId: number) => `/notes/${baseId}/mooc` },
  { key: "tasks", label: "任务", href: (baseId: number) => `/notes/${baseId}/tasks` },
  { key: "docs", label: "资料", href: (baseId: number) => `/notes/${baseId}/docs` },
  { key: "members", label: "成员", href: (baseId: number) => `/notes/${baseId}/members` },
] as const satisfies readonly {
  key: KnowledgeBaseSection;
  label: string;
  href: (baseId: number) => string;
}[];

export type OverviewTileKey = (typeof OVERVIEW_TILES)[number]["key"];

/**
 * 色块类名（图例 11–15 逐条给了颜色）。
 *
 * 用 Tailwind 的语义色而不是 hex：深色模式下这五个色各有自己的取值
 * （`--state-*`），写死 hex 会让深色版停在浅色的那一档。
 *
 * 「资料」是靛蓝 #5856D6（图例写"色块 靛"），仓库里没有对应的 `--state-*`，
 * 所以单列一个 `indigo` 变体放在 `globals.css`，不借用 `info`（那是青色）。
 */
export const TILE_BLOCK_CLASS: Record<OverviewTileKey, string> = {
  notes: "bg-accent",
  mooc: "bg-organization",
  tasks: "bg-warning",
  docs: "bg-indigo",
  members: "bg-success",
};

/**
 * 计数文案：`undefined` 与加载中都不显示数字。
 *
 * 不能把 `undefined` 折成 0——那会在数据到达前先显示一圈「0 篇笔记」，
 * 用户读到的是"这个库是空的"。
 */
export function tileCountText(total: number | null | undefined): string | null {
  return typeof total === "number" && Number.isFinite(total) ? String(total) : null;
}

/** 侧栏 `knowledgeBaseSections` 里存在、但概览 5 格不含的 section。 */
export function tileKeysCoveredBySidebar(): KnowledgeBaseSection[] {
  return OVERVIEW_TILES.map((tile) => tile.key).filter((key) =>
    knowledgeBaseSections.some((section) => section.key === key),
  );
}
