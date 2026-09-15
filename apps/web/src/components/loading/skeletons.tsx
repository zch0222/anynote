import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Fragment, type ReactNode } from "react";

/**
 * 骨架 → 宿主映射（设计稿 P13 底部那张对照表，落成可复用的形状）。
 *
 * 为什么需要预设而不是每个页面各写几行 `<Skeleton>`：
 * 骨架的价值全在**形状要对得上将要出现的内容**。各页面各写一份的结果是
 * 卡片页给了行骨架、表格页给了卡片骨架——加载完成时整页跳一下，
 * 比不显示骨架更糟。所以宿主类型收敛成固定几种，页面只负责选一种。
 *
 * | 预设 | 宿主 |
 * |---|---|
 * | `CardGridSkeleton` | 知识库列表 / 慕课列表 / 协同文档库（卡片网格） |
 * | `ListRowsSkeleton` | 笔记列表 / 成员列表 / 资料列表（行 + 缩略图） |
 * | `TableSkeleton` | 任务（表格行） |
 * | `DocumentSkeleton` | PDF 预览（文档页） |
 * | `EditorSkeleton` | 笔记 / 协作文档（标题 + 段落） |
 * | `PanelSkeleton` | 协同工作区 / 设置面板（一整块） |
 * | `CalendarSkeleton` | 日期时间浮层（月份行 + 7 列日期格） |
 *
 * 全部带 `aria-busy`：读屏用户需要知道"这块正在变"，否则只会念到一个空区域。
 * 各个 `Skeleton` 自己是 `aria-hidden` 的，不会刷屏。
 */

/**
 * 重复 `count` 次渲染占位块。
 *
 * 这里**用下标当 key 是正确写法**：骨架是定长的静态占位，没有身份、也不会重排，
 * 不满足"key 要反映身份"所针对的前提（那是给会增删重排的真实数据准备的）。
 * 规则只看写法看不出这个区别，所以在**这一处**统一豁免，
 * 而不是在六个调用点各写一遍——散落的豁免会让后来人以为别处也能这么干。
 */
function SkeletonBlocks({
  count,
  children,
}: {
  count: number;
  children: (index: number) => ReactNode;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 定长静态占位，无身份、不重排
        <Fragment key={index}>{children(index)}</Fragment>
      ))}
    </>
  );
}

/** 卡片网格：与画廊的 3 列断点一致，避免加载完成时列数突变。 */
export function CardGridSkeleton({
  count = 6,
  cardClassName = "h-[148px]",
  className,
}: {
  count?: number;
  cardClassName?: string;
  className?: string;
}) {
  return (
    <div
      aria-busy="true"
      data-slot="skeleton-card-grid"
      className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
    >
      <SkeletonBlocks count={count}>
        {() => <Skeleton className={cn("rounded-lg", cardClassName)} />}
      </SkeletonBlocks>
    </div>
  );
}

/**
 * 行列表：笔记 / 成员 / 资料。
 *
 * 每一行是「图标 + 一行文字 + 右端元信息」——这正是设计稿里笔记行的结构
 * （列表不用卡片：一屏能看的条数比封面重要）。
 */
export function ListRowsSkeleton({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div aria-busy="true" data-slot="skeleton-list" className={cn("space-y-2", className)}>
      <SkeletonBlocks count={count}>
        {() => (
          <div className="flex min-h-14 items-center gap-3 rounded-lg bg-surface px-4 py-2.5 shadow-card">
            {/* 缩略图 16 圆角方块：对应笔记行的 NotebookPen 图标位 */}
            <Skeleton className="size-4 shrink-0 rounded-xs" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3 w-12 shrink-0" />
          </div>
        )}
      </SkeletonBlocks>
    </div>
  );
}

/** 表格行：任务表。第一行当表头，宽度收窄以示区分。 */
export function TableSkeleton({
  rows = 4,
  columns = 5,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      aria-busy="true"
      data-slot="skeleton-table"
      className={cn("overflow-hidden rounded-lg bg-surface shadow-card", className)}
    >
      <div className="flex items-center gap-4 border-b border-separator px-4 py-3">
        <SkeletonBlocks count={columns}>{() => <Skeleton className="h-3 flex-1" />}</SkeletonBlocks>
      </div>
      <SkeletonBlocks count={rows}>
        {() => (
          <div className="flex items-center gap-4 border-b border-separator px-4 py-3 last:border-b-0">
            <SkeletonBlocks count={columns}>
              {(column) => <Skeleton className={cn("h-3.5 flex-1", column === 0 && "max-w-48")} />}
            </SkeletonBlocks>
          </div>
        )}
      </SkeletonBlocks>
    </div>
  );
}

/**
 * 文档页：PDF 预览。
 *
 * 一页纸的比例是固定的（A4），所以这里给出**带比例的近似纸面**而不是一块方砖——
 * 结构占位要让用户预判"待会儿这里会有多高"。
 */
export function DocumentSkeleton({ className }: { className?: string }) {
  return (
    <div aria-busy="true" data-slot="skeleton-document" className={cn("space-y-3 p-6", className)}>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="aspect-[1/1.414] w-full rounded-lg" />
    </div>
  );
}

/**
 * 编辑器：标题 + 若干段落（笔记 / 协作文档）。
 *
 * 段落的宽度刻意**参差**：等宽的一叠灰条看起来像表格，参差才像文章，
 * 一眼就能认出"这里将出现一篇笔记"。
 */
export function EditorSkeleton({
  paragraphs = 5,
  className,
}: {
  paragraphs?: number;
  className?: string;
}) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-full", "w-3/4", "w-5/6"];
  return (
    <div aria-busy="true" data-slot="skeleton-editor" className={cn("space-y-4", className)}>
      {/* 标题：设计稿实测 18pt 行高 —— 用 h-7 对应 Display 字阶 */}
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-3 w-2/5" />
      <div className="space-y-2.5 pt-2">
        <SkeletonBlocks count={paragraphs}>
          {(index) => <Skeleton className={cn("h-3.5", widths[index % widths.length])} />}
        </SkeletonBlocks>
      </div>
    </div>
  );
}

/**
 * 会话引导 / 整卡：协同文档工作区、设置面板这类"一整个面板"的占位。
 *
 * 设计稿把「协作文档 → 整卡」单列一类：这些面板在加载完成后是一整块内容，
 * 拆成很多小条反而会让人以为会有很多元素。
 */
export function PanelSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-busy="true"
      data-slot="skeleton-panel"
      className={cn("space-y-3 rounded-xl border border-separator bg-surface p-4", className)}
    >
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-5/6" />
    </div>
  );
}

/**
 * 日期时间浮层：月份行 + 星期表头 + 6 行日期格。
 *
 * 形状按 `DateTimeCalendar` 实测（浮层宽 296、格 36 高、7 列）——
 * 日期格给 36 高而不是文字行高：给矮了加载完成时浮层会往下长一截，
 * 而用户的手正停在上面。
 */
export function CalendarSkeleton({ className }: { className?: string }) {
  return (
    <div aria-busy="true" data-slot="skeleton-calendar" className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="size-8 rounded-md" />
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        <SkeletonBlocks count={7}>{() => <Skeleton className="mx-auto h-6 w-6" />}</SkeletonBlocks>
        <SkeletonBlocks count={42}>
          {() => <Skeleton className="mx-auto h-9 w-9 rounded-md" />}
        </SkeletonBlocks>
      </div>
      <div className="flex items-center gap-2 border-t border-separator pt-2.5">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 flex-1" />
      </div>
    </div>
  );
}
