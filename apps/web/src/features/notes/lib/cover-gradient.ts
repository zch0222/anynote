import { cn } from "@/lib/utils";

/**
 * 知识库封面渐变组数，与 `globals.css` 里的 `.kb-cover-{0..4}` 一一对应。
 * 改这里必须同步改 CSS，反之亦然——单测会卡住这个数量。
 */
export const KB_COVER_VARIANTS = 5;

/**
 * 由知识库 ID 选一组渐变色。
 *
 * **不用 `cover` 字段**：后端 `/bases` 返回的 `cover` 是同一张默认图
 * （`DEFAULT_BASE_COVER`），一屏 6 张卡全长得一样，卡片网格就废了；
 * 而设计稿要的是"一眼能区分"。用 ID 取模得到的色相既稳定（同一个库每次
 * 进来颜色不变）又无需后端改动。
 *
 * 负数与非整数在这里没有意义（ID 恒为正整数），但取模前先做一次归一，
 * 免得将来被负数 ID 或 NaN 带出一个非法类名。
 */
export function coverVariant(baseId: number): number {
  if (!Number.isFinite(baseId)) return 0;
  const index = Math.trunc(baseId) % KB_COVER_VARIANTS;
  return index < 0 ? index + KB_COVER_VARIANTS : index;
}

/** 封面类名：`kb-cover kb-cover-2`。 */
export function coverClassName(baseId: number): string {
  return `kb-cover kb-cover-${coverVariant(baseId)}`;
}

/** 列表项头像用的同类渐变（尺寸不同，取色逻辑共用一份）。 */
export function coverAvatarClassName(baseId: number, className?: string): string {
  return cn(coverClassName(baseId), "shrink-0 rounded-md", className);
}
