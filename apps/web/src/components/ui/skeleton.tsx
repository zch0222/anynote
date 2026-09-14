import { cn } from "@/lib/utils";

/**
 * 骨架块（设计稿 P13「01 骨架屏 Skeleton」）。
 *
 * 全部加载态里**主力形态**：首屏 / 列表 / 表格 / 编辑器 / 文档的结构占位。
 *
 * 两处与旧实现不同，都是设计稿明确要求的：
 * 1. **底色换成 `--skeleton-base`**（浅 #E5E5EA / 深 #2C2C2E）。旧的 `bg-grouped`
 *    在浅色分组底（#F2F2F7）上几乎同色，卡片骨架整片隐形——加载态变成"什么都没发生"。
 *    骨架块必须比**承载它的那一层**高一档。
 * 2. **扫光而不是呼吸**：1.4s ease-in-out 无限循环，highlight 从 -30% 扫到 130%。
 *    呼吸（`animate-pulse`）在小尺寸上读不出方向，扫光才能表达"正在进来"。
 *
 * 降级：`prefers-reduced-motion` 下换成呼吸式淡入淡出而不是静止——
 * 静止会让加载态彻底失去"正在进行"这唯一信息（见 globals.css）。
 */

/** 8 种形状由调用方用 `className` 给（h-* / w-* / rounded-*），这里只定底色与动画。 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "animate-shimmer rounded-md",
        /*
         * 扫光层用 background-image 叠在底色上：一来 `background-position` 能直接驱动
         * 平移（不用伪元素 + transform，少一层合成），二来深浅两态只需要换变量。
         * 115deg 让亮带斜着扫过，纯水平扫光在扁长的文字行上看不出移动。
         */
        "bg-skeleton bg-[linear-gradient(115deg,transparent_35%,var(--skeleton-sheen)_50%,transparent_65%)] bg-[length:220%_100%]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
